/**
 * 途家首页去广告
 * 清理：顶部 Banner、预售 Banner、悬浮球、搜索按钮广告
 * 保留：筛选器、热搜、Tab、必住指南等正常功能
 */

const url = $request.url;
if (!$response.body) {
  $done({});
}

try {
  let body = JSON.parse($response.body);

  // 只处理带 content 的首页响应
  if (body && body.content && typeof body.content === "object") {
    const content = body.content;

    // 1. 清除顶部大 Banner 广告
    if (Array.isArray(content.topBannerVO)) {
      content.topBannerVO = [];
    }

    // 2. 清除预售/活动 Banner
    if (content.cTripPresellBanners && typeof content.cTripPresellBanners === "object") {
      if (Array.isArray(content.cTripPresellBanners.banners)) {
        content.cTripPresellBanners.banners = [];
      }
      // 可选：彻底去掉整个模块（更干净）
      // content.cTripPresellBanners = null;
    }

    // 3. 清除悬浮球广告（核心）
    if (content.otherConfig && typeof content.otherConfig === "object") {
      if (content.otherConfig.floatingBall) {
        content.otherConfig.floatingBall = null;
        // 或者更温和：只清空 banner
        // if (content.otherConfig.floatingBall.bannerModule) {
        //   content.otherConfig.floatingBall.bannerModule.banners = [];
        // }
      }
    }

    // 4. 清除搜索按钮广告
    if (content.searchButtonAdvertising) {
      content.searchButtonAdvertising = {
        code: "",
        advertisingType: 0,
        popupModule: null,
        text: null,
        title: null,
        bannerModule: null
      };
    }

    // 5. 清空其他可能的广告位（安全处理）
    if (Array.isArray(content.middleBannerV2)) content.middleBannerV2 = [];
    if (Array.isArray(content.middleBannerV3)) content.middleBannerV3 = [];
    if (Array.isArray(content.middleKingKongsV2)) content.middleKingKongsV2 = [];
    if (Array.isArray(content.searchBannerVO)) content.searchBannerVO = [];
  }

  $done({ body: JSON.stringify(body) });
} catch (e) {
  // 解析失败则原样返回，避免影响正常使用
  console.log("途家去广告脚本异常: " + e);
  $done({});
}
