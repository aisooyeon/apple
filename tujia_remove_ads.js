// tujia_remove_ads.js
let body = $response.body;

if (body) {
  try {
    let obj = JSON.parse(body);

    if (obj?.content) {
      // 1. 清空顶部轮播广告，保留空数组维持数据类型
      if (Array.isArray(obj.content.topBannerVO)) {
        obj.content.topBannerVO = [];
      }

      // 2. 预售 Banner：只清空广告列表，保留模块结构
      if (obj.content.cTripPresellBanners) {
        obj.content.cTripPresellBanners.banners = [];
      }

      // 3. 搜索按钮广告：将广告类型重置为 0/null，清空营销文案
      if (obj.content.searchButtonAdvertising) {
        obj.content.searchButtonAdvertising.advertisingType = 0;
        obj.content.searchButtonAdvertising.bannerModule = null;
        obj.content.searchButtonAdvertising.popupModule = null;
      }

      // 4. 首页悬浮球广告：清空 banner 数组，保留底层框架
      if (obj.content.otherConfig?.floatingBall?.bannerModule) {
        obj.content.otherConfig.floatingBall.bannerModule.banners = [];
      }

      // 5. 搜索按钮浮层文案（如“积分抵210元”）：置为空字符串
      if (obj.content.extend?.searchButtonInfo) {
        obj.content.extend.searchButtonInfo.searchButtonText = "";
      }
    }

    body = JSON.stringify(obj);
  } catch (e) {
    console.log("途家精细化去广告脚本异常: " + e);
  }
}

$done({ body });
