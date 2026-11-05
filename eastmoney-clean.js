if (Array.isArray(news.images)) {
  news.images = news.images.map(function (image) {
    if (!image || typeof image !== "object") return image;

    // 精确识别已确认的广告图片。
    var knownAd =
      /(?:^|\/)D24963336202551900518_w690h180(?:\.[a-z0-9]+)?(?:[?#]|$)/i.test(
        image.src || ""
      );

    // 同时保留原有广告 class、推广链接识别。
    if (!knownAd && !isAdImage(image)) return image;

    if (
      typeof image.label === "string" &&
      /^<!--IMG#\d+-->$/.test(image.label)
    ) {
      var label = image.label;
      var escaped = label.replace(
        /[.*+?^$\{\}()|[\]\\]/g,
        "\\$&"
      );

      // 删除只包含该广告图片及其链接的完整段落。
      var paragraph = new RegExp(
        "<p\\b[^>]*>\\s*(?:<a\\b[^>]*>\\s*)?" +
          escaped +
          "\\s*(?:<\\/a\\s*>\\s*)?<\\/p\\s*>",
        "gi"
      );

      news.body = news.body.replace(paragraph, "");

      // 若图片混在正文段落里，只移除广告占位。
      news.body = news.body.split(label).join("");
    }

    // 清除广告地址和跳转信息，保留数组位置。
    return {
      label: image.label || "",
      src: ""
    };
  });
}
