/*
 * 12306 去广告整合版（请求阶段）
 *
 * 原作者：
 * RuCu6 — header.js
 * @ddgksf2013 / 墨鱼手记 — 12306.js V1.0.23
 *
 * 匹配接口：
 * https://mobile.12306.cn/otsmobile/app/mgs/mgw.htm
 * https://ad.12306.cn/ad/ser/getAdList
 *
 * MITM：
 * mobile.12306.cn, ad.12306.cn
 *
 * 广告接口需开启读取请求正文。
 * 原作者建议 ad.12306.cn 设置直连。
 *
 * 保留原版回调方式，具体兼容性取决于代理工具：
 * 网关命中时使用 $done()；
 * 广告接口根据 $task 是否存在选择响应格式。
 */

(function () {
  var request = typeof $request !== "undefined" ? $request : {};
  var url = request.url || "";
  var result = {};

  try {
    if (
      /^https:\/\/mobile\.12306\.cn\/otsmobile\/app\/mgs\/mgw\.htm(?:\?|$)/i.test(url)
    ) {
      var headers = request.headers || {};
      var operation;

      Object.keys(headers).some(function (key) {
        if (key.toLowerCase() === "operation-type") {
          operation = headers[key];
          return true;
        }
        return false;
      });

      var operations = [
        // 活动横幅
        "com.cars.otsmobile.integration.activityBanner",

        // 会员常见问题：需要保留该功能时，注释下面这一行
        "com.cars.otsmobile.memberInfo.getMemberQa",

        // 热门资讯
        "com.cars.otsmobile.newHomePage.initData",

        // 商品信息流
        "com.cars.otsmobile.newHomePageBussData",

        // 商业推广
        "com.cars.otsmobile.paySuccBuss.bussEntryShow"
      ];

      if (operations.indexOf(operation) !== -1) {
        // 保留原脚本的无参数回调语义。
        return $done();
      }
    } else if (
      /^https?:\/\/ad\.12306\.cn\/ad\/ser\/getAdList(?:\?|$)/i.test(url)
    ) {
      var data = JSON.parse(request.body);

      // 正文异常或缺少广告位时放行。
      if (
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        typeof data.placementNo === "string" &&
        data.placementNo.length > 0
      ) {
        var response;

        if (data.placementNo === "0007") {
          response = {
            materialsList: [
              {
                billMaterialsId: "6491",
                filePath: "ddgksf2013",
                creativeType: 1
              }
            ],
            advertParam: {
              skipTime: 1
            },
            code: "00"
          };
        } else if (data.placementNo === "G0054") {
          response = {
            code: "00",
            materialsList: [{}]
          };
        } else {
          response = {
            code: "00",
            message: "无广告返回"
          };
        }

        var body = JSON.stringify(response);

        result =
          typeof $task !== "undefined"
            ? { body: body }
            : { response: { body: body } };
      }
    }
  } catch (error) {
    // 解析失败时放行，不输出可能包含个人信息的请求内容。
    result = {};
  }

  return $done(result);
})();
