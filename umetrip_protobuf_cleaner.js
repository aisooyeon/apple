/*
 * 航旅纵横 Protobuf Response Cleaner
 * Quantumult X / Surge / Loon
 *
 * 用途：
 *   对航旅纵横部分 Response Body 中的 Protobuf / JSON
 *   做客户端展示层过滤。
 *
 * 特点：
 *   1. Protobuf Varint / Length-delimited 解析
 *   2. 保留原始字段 bytes
 *   3. 仅修改命中的节点
 *   4. RPID 页面级处理
 *   5. JSON Payload 单独处理
 *   6. 异常自动回退原始 body
 */

"use strict";

/* =========================================================
 * 基础配置
 * ========================================================= */

const RPID = Object.freeze({
    EMPTY_1: "1000019",
    EMPTY_2: "1420002",
    EMPTY_3: "1120000",

    HOME: "1000002",
    WATERFALL: "1000029",
    TRIP_BANNER: "1370126",
    FAMILY: "1370279",
    HISTORY: "1011058",
    MINE: "1100001",
    FLIGHT: "1060060"
});


/* =========================================================
 * 要删除 / 隐藏的文本
 * ========================================================= */

const RULES = Object.freeze({

    HOME: [
        "机上闭门购虚拟卡片",
        "里程积分兑换_首页右上角入口",
        "广告兜底服务2",
        "无行程机票直销卡片",
        "跟着电影去旅行",
        "回归礼包_无行程首页底部条",
        "解锁888元隐藏优惠"
    ],

    WATERFALL: [
        "瀑布流_特价机票",
        "瀑布流_酒店",
        "瀑布流_租车卡片",
        "瀑布流_权益",
        "瀑布流_今日热议",
        "瀑布流_城市攻略",
        "瀑布流_景点攻略",
        "瀑布流_附近底部跳转"
    ],

    MEMBERSHIP: [
        "付费会员"
    ],

    HISTORY: [
        "历史行程容量剩余",
        "付费会员"
    ],

    FAMILY: [
        "可免费试用30天",
        "添加家人并开启守护"
    ]
});


/* =========================================================
 * UTF-8 工具
 * ========================================================= */

const textDecoder = new TextDecoder("utf-8");
const textEncoder = new TextEncoder();

const utf8Cache = new Map();

function bytesToString(bytes) {
    if (!bytes || !bytes.length) return "";

    /*
     * 避免对相同 Uint8Array 反复解码。
     * 小型 payload 通常可以明显减少重复字符串转换。
     */
    const key = bytes.byteLength + ":" + bytes[0];

    if (utf8Cache.has(key)) {
        const cached = utf8Cache.get(key);

        /*
         * cache 只作为快速路径。
         * 对真正 payload 仍然进行 decode。
         */
        if (cached.bytes === bytes) {
            return cached.value;
        }
    }

    let value;

    try {
        value = textDecoder.decode(bytes);
    } catch (_) {
        value = "";
    }

    if (utf8Cache.size > 256) {
        utf8Cache.clear();
    }

    utf8Cache.set(key, {
        bytes,
        value
    });

    return value;
}


function stringToBytes(str) {
    return textEncoder.encode(str);
}


function isProbablyJSON(bytes) {
    if (!bytes || !bytes.length) return false;

    let i = 0;

    while (i < bytes.length) {
        const c = bytes[i];

        if (
            c === 0x20 ||
            c === 0x09 ||
            c === 0x0a ||
            c === 0x0d
        ) {
            i++;
            continue;
        }

        return c === 0x7b || c === 0x5b;
    }

    return false;
}


/* =========================================================
 * Varint
 * ========================================================= */

function readVarint(bytes, offset) {

    let value = 0n;
    let shift = 0n;

    for (let i = offset; i < bytes.length && i < offset + 10; i++) {

        const b = bytes[i];

        value |= BigInt(b & 0x7f) << shift;

        if ((b & 0x80) === 0) {
            return {
                value,
                offset: i + 1
            };
        }

        shift += 7n;
    }

    throw new Error("Invalid protobuf varint");
}


function encodeVarint(value) {

    let n = typeof value === "bigint"
        ? value
        : BigInt(value);

    const result = [];

    while (n >= 0x80n) {
        result.push(Number((n & 0x7fn) | 0x80n));
        n >>= 7n;
    }

    result.push(Number(n));

    return Uint8Array.from(result);
}


/* =========================================================
 * Bytes
 * ========================================================= */

function concatBytes(...arrays) {

    let total = 0;

    for (const arr of arrays) {
        if (arr) total += arr.length;
    }

    const result = new Uint8Array(total);

    let offset = 0;

    for (const arr of arrays) {

        if (!arr || !arr.length) continue;

        result.set(arr, offset);
        offset += arr.length;
    }

    return result;
}


function bytesEqual(a, b) {

    if (!a || !b || a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }

    return true;
}


/* =========================================================
 * Protobuf Parser
 *
 * 支持：
 *   0 = Varint
 *   1 = Fixed64
 *   2 = Length Delimited
 *   5 = Fixed32
 * ========================================================= */

function parseMessage(bytes) {

    const fields = [];

    let offset = 0;

    while (offset < bytes.length) {

        const start = offset;

        const keyInfo = readVarint(bytes, offset);

        const key = Number(keyInfo.value);

        offset = keyInfo.offset;

        const fieldNumber = key >>> 3;
        const wireType = key & 7;

        if (fieldNumber <= 0) {
            throw new Error("Invalid protobuf field");
        }

        let value;
        let rawValue;

        switch (wireType) {

            case 0: {

                const info = readVarint(bytes, offset);

                value = info.value;

                rawValue = bytes.slice(
                    offset,
                    info.offset
                );

                offset = info.offset;

                break;
            }

            case 1: {

                if (offset + 8 > bytes.length) {
                    throw new Error("Invalid fixed64");
                }

                value = bytes.slice(
                    offset,
                    offset + 8
                );

                rawValue = value;

                offset += 8;

                break;
            }

            case 2: {

                const lengthInfo = readVarint(bytes, offset);

                const length = Number(lengthInfo.value);

                offset = lengthInfo.offset;

                if (
                    !Number.isSafeInteger(length) ||
                    length < 0 ||
                    offset + length > bytes.length
                ) {
                    throw new Error("Invalid protobuf length");
                }

                value = bytes.slice(
                    offset,
                    offset + length
                );

                rawValue = value;

                offset += length;

                break;
            }

            case 5: {

                if (offset + 4 > bytes.length) {
                    throw new Error("Invalid fixed32");
                }

                value = bytes.slice(
                    offset,
                    offset + 4
                );

                rawValue = value;

                offset += 4;

                break;
            }

            default:

                throw new Error(
                    "Unsupported protobuf wire type: " + wireType
                );
        }

        fields.push({
            fieldNumber,
            wireType,
            value,
            rawValue,
            original: bytes.slice(start, offset),
            dirty: false,
            remove: false
        });
    }

    return fields;
}


/* =========================================================
 * Protobuf Encoder
 * ========================================================= */

function encodeField(field) {

    if (field.remove) {
        return new Uint8Array();
    }

    /*
     * 未修改字段直接使用原始 bytes。
     */
    if (!field.dirty) {
        return field.original;
    }

    const key = encodeVarint(
        BigInt((field.fieldNumber << 3) | field.wireType)
    );

    if (field.wireType === 0) {

        return concatBytes(
            key,
            encodeVarint(field.value)
        );
    }

    if (field.wireType === 1) {

        return concatBytes(
            key,
            field.value
        );
    }

    if (field.wireType === 2) {

        return concatBytes(
            key,
            encodeVarint(field.value.length),
            field.value
        );
    }

    if (field.wireType === 5) {

        return concatBytes(
            key,
            field.value
        );
    }

    throw new Error("Unsupported wire type");
}


function encodeMessage(fields) {

    const result = [];

    for (const field of fields) {

        if (field.remove) continue;

        result.push(
            encodeField(field)
        );
    }

    return concatBytes(...result);
}


/* =========================================================
 * 文本匹配
 * ========================================================= */

function containsAny(text, rules) {

    if (!text || !rules) return false;

    for (const rule of rules) {

        if (text.includes(rule)) {
            return true;
        }
    }

    return false;
}


/* =========================================================
 * field 37 == ADVERT
 *
 * 保留你原代码中的特殊广告节点判断。
 * ========================================================= */

function isAdvertField(field) {

    if (!field) return false;

    if (field.fieldNumber !== 37) {
        return false;
    }

    if (field.wireType !== 2) {
        return false;
    }

    const text = bytesToString(field.value);

    return text.includes("ADVERT");
}


/* =========================================================
 * JSON 处理
 * ========================================================= */

function safeJSONParse(bytes) {

    if (!isProbablyJSON(bytes)) {
        return null;
    }

    try {

        const text = bytesToString(bytes);

        return JSON.parse(text);

    } catch (_) {

        return null;
    }
}


function rewriteJsonFields(value, context) {

    if (!value || typeof value !== "object") {
        return false;
    }

    let changed = false;

    if (Array.isArray(value)) {

        for (let i = value.length - 1; i >= 0; i--) {

            const item = value[i];

            if (
                item &&
                typeof item === "object" &&
                shouldRemoveJsonNode(item, context)
            ) {
                value.splice(i, 1);
                changed = true;
                continue;
            }

            if (
                item &&
                typeof item === "object"
            ) {
                if (
                    rewriteJsonFields(
                        item,
                        context
                    )
                ) {
                    changed = true;
                }
            }
        }

        return changed;
    }

    for (const key of Object.keys(value)) {

        const current = value[key];

        if (
            current &&
            typeof current === "object"
        ) {

            if (
                shouldRemoveJsonNode(
                    current,
                    context
                )
            ) {

                delete value[key];

                changed = true;

                continue;
            }

            if (
                rewriteJsonFields(
                    current,
                    context
                )
            ) {
                changed = true;
            }
        }
    }

    return changed;
}


function shouldRemoveJsonNode(node, context) {

    if (!node || typeof node !== "object") {
        return false;
    }

    /*
     * 我的页面：
     * groupId = 111402
     */
    if (context.groupId === 111402) {

        if (node.groupId === 111402) {
            return false;
        }

        if (
            node.name === "会员月卡" ||
            node.label === "会员月卡" ||
            node.title === "会员月卡"
        ) {
            return true;
        }

        if (
            typeof node.goodsName === "string" &&
            /^商品\d+$/.test(node.goodsName)
        ) {
            return true;
        }

        if (
            typeof node.name === "string" &&
            /^商品\d+$/.test(node.name)
        ) {
            return true;
        }
    }


    /*
     * groupId = 111403
     */
    if (context.groupId === 111403) {

        if (
            node.cardType === "PRODUCT"
        ) {
            return true;
        }
    }


    /*
     * groupId = 111404
     */
    if (context.groupId === 111404) {

        if (
            typeof node.title === "string" &&
            (
                node.title.includes("买三送一") ||
                node.title.includes("全民推荐官")
            )
        ) {
            return true;
        }

        if (
            typeof node.subCaption === "string" &&
            (
                node.subCaption.includes("视频会员") ||
                node.subCaption.includes("返现")
            )
        ) {
            return true;
        }
    }


    return false;
}


/* =========================================================
 * JSON Payload
 * ========================================================= */

function processJsonPayload(bytes, context) {

    const json = safeJSONParse(bytes);

    if (json === null) {
        return {
            bytes,
            changed: false
        };
    }

    const changed = rewriteJsonFields(
        json,
        context
    );

    if (!changed) {
        return {
            bytes,
            changed: false
        };
    }

    try {

        return {
            bytes: stringToBytes(
                JSON.stringify(json)
            ),
            changed: true
        };

    } catch (_) {

        return {
            bytes,
            changed: false
        };
    }
}


/* =========================================================
 * Protobuf 深度处理
 * ========================================================= */

function transformNested(
    bytes,
    context,
    depth = 0
) {

    /*
     * 防止异常 protobuf 导致递归过深。
     */
    if (depth > 12) {
        return {
            bytes,
            changed: false
        };
    }

    /*
     * JSON 优先。
     */
    if (isProbablyJSON(bytes)) {

        const jsonResult =
            processJsonPayload(
                bytes,
                context
            );

        if (jsonResult.changed) {
            return jsonResult;
        }
    }

    let fields;

    try {

        fields = parseMessage(bytes);

    } catch (_) {

        return {
            bytes,
            changed: false
        };
    }

    let changed = false;


    for (const field of fields) {

        /*
         * 广告字段
         */
        if (
            context.removeAdvert &&
            isAdvertField(field)
        ) {

            field.remove = true;

            changed = true;

            continue;
        }


        /*
         * 只深入 Length-delimited。
         */
        if (
            field.wireType !== 2 ||
            !field.value.length
        ) {
            continue;
        }


        /*
         * 文本判断。
         */
        const text =
            bytesToString(field.value);


        /*
         * 当前节点文本命中规则。
         */
        if (
            context.rules &&
            containsAny(
                text,
                context.rules
            )
        ) {

            field.remove = true;

            changed = true;

            continue;
        }


        /*
         * 会员节点。
         */
        if (
            context.removeMembership &&
            text.includes("付费会员")
        ) {

            field.remove = true;

            changed = true;

            continue;
        }


        /*
         * 首页特殊广告。
         */
        if (
            context.home &&
            text.includes("ADVERT")
        ) {

            field.remove = true;

            changed = true;

            continue;
        }


        /*
         * 尝试递归 protobuf。
         *
         * 只有看起来像 protobuf 的数据才递归。
         */
        const nested =
            transformNested(
                field.value,
                context,
                depth + 1
            );


        if (nested.changed) {

            field.value = nested.bytes;

            field.dirty = true;

            changed = true;
        }
    }


    if (!changed) {

        return {
            bytes,
            changed: false
        };
    }


    return {
        bytes: encodeMessage(fields),
        changed: true
    };
}


/* =========================================================
 * 页面处理器
 * ========================================================= */

function cleanHomePayload(bytes) {

    return transformNested(
        bytes,
        {
            rules: RULES.HOME,
            removeAdvert: true,
            home: true
        }
    );
}


function cleanWaterfallPayload(bytes) {

    return transformNested(
        bytes,
        {
            rules: RULES.WATERFALL,
            removeAdvert: true
        }
    );
}


function cleanTripBannerPayload(bytes) {

    return transformNested(
        bytes,
        {
            rules: RULES.MEMBERSHIP,
            removeMembership: true
        }
    );
}


function cleanHistoryPayload(bytes) {

    return transformNested(
        bytes,
        {
            rules: RULES.HISTORY,
            removeMembership: true
        }
    );
}


function cleanFlightPayload(bytes) {

    return transformNested(
        bytes,
        {
            rules: RULES.MEMBERSHIP,
            removeMembership: true
        }
    );
}


function cleanFamilyPayload(bytes) {

    return transformNested(
        bytes,
        {
            rules: RULES.FAMILY,
            removeMembership: true
        }
    );
}


function cleanMinePayload(bytes) {

    return transformNested(
        bytes,
        {}
    );
}


/* =========================================================
 * RPID Handler
 * ========================================================= */

const HANDLERS = {

    [RPID.HOME]: cleanHomePayload,

    [RPID.WATERFALL]: cleanWaterfallPayload,

    [RPID.TRIP_BANNER]: cleanTripBannerPayload,

    [RPID.HISTORY]: cleanHistoryPayload,

    [RPID.FLIGHT]: cleanFlightPayload,

    [RPID.FAMILY]: cleanFamilyPayload,

    [RPID.MINE]: cleanMinePayload
};


/* =========================================================
 * 查找 RPID
 *
 * 你的原脚本是从 protobuf 节点中寻找 RPID。
 * 这里使用递归文本搜索。
 * ========================================================= */

function findRpid(bytes, depth = 0) {

    if (!bytes || depth > 8) {
        return null;
    }

    /*
     * 直接搜索常见 RPID 字符串。
     */
    const text = bytesToString(bytes);

    for (const key of Object.keys(HANDLERS)) {

        if (text.includes(key)) {
            return key;
        }
    }


    /*
     * 再从 protobuf 节点寻找。
     */
    let fields;

    try {

        fields = parseMessage(bytes);

    } catch (_) {

        return null;
    }


    for (const field of fields) {

        if (
            field.wireType !== 2 ||
            !field.value.length
        ) {
            continue;
        }

        const childText =
            bytesToString(field.value);

        for (const key of Object.keys(HANDLERS)) {

            if (childText.includes(key)) {
                return key;
            }
        }

        const nested =
            findRpid(
                field.value,
                depth + 1
            );

        if (nested) {
            return nested;
        }
    }

    return null;
}


/* =========================================================
 * 顶层 Field 7
 *
 * 保留你原代码中针对 top field 7 的处理思路。
 * ========================================================= */

function transformTopField7(bytes, handler) {

    let fields;

    try {

        fields = parseMessage(bytes);

    } catch (_) {

        return {
            bytes,
            changed: false
        };
    }

    let changed = false;

    for (const field of fields) {

        if (
            field.fieldNumber !== 7 ||
            field.wireType !== 2
        ) {
            continue;
        }

        const result =
            handler(field.value);

        if (result.changed) {

            field.value = result.bytes;

            field.dirty = true;

            changed = true;
        }
    }


    if (!changed) {

        return {
            bytes,
            changed: false
        };
    }


    return {
        bytes: encodeMessage(fields),
        changed: true
    };
}


/* =========================================================
 * 主处理
 * ========================================================= */

function processBody(bodyBytes) {

    if (
        !bodyBytes ||
        !bodyBytes.length
    ) {
        return bodyBytes;
    }


    /*
     * 先尝试确定 RPID。
     */
    const rpid =
        findRpid(bodyBytes);


    if (!rpid) {

        /*
         * 没有识别到 RPID：
         * 只对可能存在 JSON group 的响应做轻量处理。
         */
        return bodyBytes;
    }


    const handler =
        HANDLERS[rpid];


    if (typeof handler !== "function") {
        return bodyBytes;
    }


    /*
     * 优先处理顶层 Field 7。
     */
    const field7Result =
        transformTopField7(
            bodyBytes,
            handler
        );


    if (field7Result.changed) {
        return field7Result.bytes;
    }


    /*
     * 某些接口没有 Field 7，
     * 直接处理整个 payload。
     */
    const result =
        handler(bodyBytes);


    if (result.changed) {
        return result.bytes;
    }


    return bodyBytes;
}


/* =========================================================
 * Quantumult X / Surge / Loon
 * ========================================================= */

try {

    if (
        typeof $response !== "undefined" &&
        $response.bodyBytes
    ) {

        const original =
            $response.bodyBytes;

        const modified =
            processBody(original);

        $done({
            bodyBytes: modified
        });

    } else {

        $done({});
    }

} catch (e) {

    /*
     * 最重要的保护：
     * 任何解析异常都不阻断 App。
     */

    console.log(
        "[UmeTrip Cleaner] Error: " +
        e.message
    );

    if (
        typeof $response !== "undefined" &&
        $response.bodyBytes
    ) {

        $done({
            bodyBytes: $response.bodyBytes
        });

    } else {

        $done({});
    }
}
