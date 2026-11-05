/*
 * 东方财富新闻去广告 — Loon
 * requires_body=true
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
    var promo = /^(?:https?:)?\/\/acttg\.eastmoney\.com(?:[/:?#]|$)/i;

    // 读取 HTML 属性，避免误匹配 data-class、data-href。
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

    // 删除完整节点，支持同名标签嵌套。
    // 未闭合节点保留，避免吞掉后续正文。
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

    // 按广告标记及推广链接识别，图片改名仍可匹配。
    function isAdImage(image) {
      if (!image || typeof image !== "object") return false;

      if (
        /(?:^|\s)em_handle_adv_close(?:\s|$)/i.test(
          image.class || ""
        )
      ) {
        return true;
      }

      if (
        promo.test(image.Link || "") ||
        promo.test(image.src || "")
      ) {
        return true;
      }

      var outlink = image.outlink;

      return !!(
        outlink &&
        typeof outlink === "object" &&
        Object.keys(outlink).some(function (key) {
          return (
            typeof outlink[key] === "string" &&
            promo.test(outlink[key])
          );
        })
      );
    }

    if (Array.isArray(news.images)) {
      news.images = news.images.map(function (image) {
        if (!isAdImage(image)) return image;

        var label = image.label;

        if (
          typeof label === "string" &&
          /^<!--IMG#\d+-->$/.test(label)
        ) {
          var escaped = label.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );

          // 删除包含广告占位的完整推广段落。
          var modulePattern = new RegExp(
            "<p\\b[^>]*>\\s*" +
              "(?:<a\\b[^>]*>\\s*" +
              escaped +
              "\\s*</a\\s*>|" +
              escaped +
              ")\\s*</p\\s*>",
            "gi"
          );

          news.body = news.body.replace(modulePattern, "");

          // 混合正文中只移除广告占位，保留文字。
          news.body = news.body.split(label).join("");
        }

        // 清空广告素材及跳转，保留正常图片的位置编号。
        return {
          label: label || "",
          src: ""
        };
      });
    }

    // 清理正文广告位模块。
    news.body = removeElements(news.body, "div", function (tag) {
      return /(?:^|\s)em_adv_mods(?:\s|$)/i.test(
        attribute(tag, "class")
      );
    });

    // 清理正文推广链接及其内部广告内容。
    news.body = removeElements(news.body, "a", function (tag) {
      return promo.test(attribute(tag, "href"));
    });

    // 清理残留的空段落和空容器。
    var previous;

    do {
      previous = news.body;
      news.body = news.body.replace(
        /<(p|center)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>\s*<\/\1\s*>/gi,
        ""
      );
    } while (news.body !== previous);

    if (
      Object.prototype.hasOwnProperty.call(
        news,
        "videoAdvSwitch"
      )
    ) {
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
