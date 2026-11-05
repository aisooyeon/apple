let result = {};

try {
  const data = JSON.parse($response.body);
  const content = data && data.errorCode === 0 && data.content;
  let changed = false;

  if (content) {
    // 清空顶部轮播，保留字段及数组类型
    if (
      Array.isArray(content.topBannerVO) &&
      content.topBannerVO.length > 0
    ) {
      content.topBannerVO.length = 0;
      changed = true;
    }

    // 精确过滤企业微信邀请悬浮广告
    const banners =
      content.otherConfig &&
      content.otherConfig.floatingBall &&
      content.otherConfig.floatingBall.bannerModule &&
      content.otherConfig.floatingBall.bannerModule.banners;

    if (Array.isArray(banners)) {
      const kept = banners.filter(item =>
        !(
          item &&
          typeof item.navigateUrl === "string" &&
          /^https:\/\/pwa\.tujia\.com\/h5\/appw\/inviteNewWeCom\/?(?:[?#]|$)/.test(
            item.navigateUrl
          )
        )
      );

      if (kept.length !== banners.length) {
        content.otherConfig.floatingBall.bannerModule.banners = kept;
        changed = true;
      }
    }
  }

  // 有实际修改时才返回新响应体
  if (changed) {
    result = { body: JSON.stringify(data) };
  }
} catch (_) {
  // 解析异常时放行原响应
}

$done(result);
