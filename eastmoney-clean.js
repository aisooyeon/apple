// 按广告模块标记和推广地址识别，不依赖图片文件名。
function isAdImage(image) {
  if (!image || typeof image !== "object") return false;

  if (
    /(?:^|\s)em_handle_adv_close(?:\s|$)/i.test(image.class || "")
  ) {
    return true;
  }

  var adURL = /^(?:https?:)?\/\/acttg\.eastmoney\.com(?:[/:?#]|$)/i;

  if (adURL.test(image.Link || "")) return true;

  var outlink = image.outlink;

  return !!(
    outlink &&
    typeof outlink === "object" &&
    Object.keys(outlink).some(function (key) {
      return (
        typeof outlink[key] === "string" &&
        adURL.test(outlink[key])
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
      var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // 删除整个广告模块：外层段落、点击链接、图片占位。
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

      // 若广告图片出现在混合正文中，仅清理其占位，
      // 避免连带删除正文文字。
      news.body = news.body.split(label).join("");
    }

    // 移除广告素材及跳转数据，保留位置以免正常配图错位。
    return {
      label: label || "",
      src: ""
    };
  });
}
