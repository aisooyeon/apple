/*
 * 东方财富新闻去广告 — Loon
 * 类型：http-response
 * requires-body=true
 * MITM：newsinfo.eastmoney.com
 */

(function () {
  var result = {};

  try {
    var data = JSON.parse($response.body);
    var news = data && data.news;

    if (!news || typeof news.body !== "string") {
      $done({});
      return;
    }

    var original = JSON.stringify(data);
    var promo = /^(?:https?:)?\/\/acttg\.eastmoney\.com(?:[\/:?#]|$)/i;

    // 单独读取属性，避免误匹配 data-class、data-href。
    function attribute(tag, name) {
      var re = /([^\s=<>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      var match;

      while ((match = re.exec(tag))) {
        if (match[1].toLowerCase() === name) {
          return match[2] !== undefined
            ? match[2]
            : match[3] !== undefined
              ? match[3]
              : match[4] || "";
        }
      }

      return "";
    }

    // 按同名标签的嵌套层级删除完整广告节点。
    // 未闭合的节点保留，避免误删后续正文。
    function removeElements(html, tagName, isAd) {
      var token = new RegExp(
        "<!--[\\s\\S]*?-->|<\\/?" +
          tagName +
          "(?=[\\s/>])(?:[^\"'<>]|\"[^\"]*\"|'[^']*')*>",
        "gi"
      );

      var match;
      var depth = 0;
      var start = -1;
      var last = 0;
      var parts = [];

      while ((match = token.exec(html))) {
        var tag = match[0];

        if (tag.indexOf("<!--") === 0) continue;

        var closing = /^<\//.test(tag);

        if (depth) {
          if (closing) {
            depth--;
          } else if (!/\/\s*>$/.test(tag)) {
            depth++;
          }

          if (!depth) {
            parts.push(html.slice(last, start));
            last = token.lastIndex;
            start = -1;
          }
        } else if (!closing && isAd(tag)) {
          start = match.index;
          depth = 1;

          if (/\/\s*>$/.test(tag)) {
            parts.push(html.slice(last, start));
            last = token.lastIndex;
            depth = 0;
          }
        }
      }

      parts.push(html.slice(last));
      return parts.join("");
    }

    function isAdImage(image) {
      if (!image || typeof image !== "object") return false;

      if (
        /(?:^|\s)em_handle_adv_close(?:\s|$)/i.test(image.class || "")
      ) {
        return true;
      }

      if (promo.test(image.Link || "") || promo.test(image.src || "")) {
        return true;
      }

      var out = image.outlink;

      return (
        out &&
        typeof out === "object" &&
        Object.keys(out).some(function (key) {
          return typeof out[key] === "string" && promo.test(out[key]);
        })
      );
    }

    if (Array.isArray(news.images)) {
      news.images = news.images.map(function (image) {
        if (!isAdImage(image)) return image;

        if (
          typeof image.label === "string" &&
          /^<!--IMG#\d+-->$/.test(image.label)
        ) {
          news.body = news.body.split(image.label).join("");
        }

        // 保留数组位置，避免后续正常图片编号错位。
        return {
          label: image.label || "",
          src: ""
        };
      });
    }

    news.body = removeElements(news.body, "div", function (tag) {
      return /(?:^|\s)em_adv_mods(?:\s|$)/i.test(
        attribute(tag, "class")
      );
    });

    news.body = removeElements(news.body, "a", function (tag) {
      return promo.test(attribute(tag, "href"));
    });

    // 清理广告移除后的空段落及嵌套空容器。
    var previous;

    do {
      previous = news.body;
      news.body = news.body.replace(
        /<(p|center)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>\s*<\/\1\s*>/gi,
        ""
      );
    } while (news.body !== previous);

    if (Object.prototype.hasOwnProperty.call(news, "videoAdvSwitch")) {
      news.videoAdvSwitch = 0;
    }

    var body = JSON.stringify(data);

    if (body !== original) {
      result = { body: body };
    }
  } catch (error) {
    console.log("[Eastmoney clean] " + String(error));
  }

  $done(result);
})();
