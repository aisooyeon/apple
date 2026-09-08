// 获取并解析接口返回的 JSON 数据
let body = $response.body;

if (body) {
  try {
    let obj = JSON.parse(body);

    if (obj && obj.content) {
      // 1. 清空顶部/中间轮播 Banner 广告
      if (obj.content.topBannerVO) {
        obj.content.topBannerVO = [];
      }
      if (obj.content.cTripPresellBanners) {
        delete obj.content.cTripPresellBanners;
      }

      // 2. 清空搜索按钮广告与悬浮球广告
      if (obj.content.searchButtonAdvertising) {
        obj.content.searchButtonAdvertising = {};
      }
      if (obj.content.otherConfig && obj.content.otherConfig.floatingBall) {
        delete obj.content.otherConfig.floatingBall;
      }

      // 3. 移除营销/膨胀券相关扩展字段
      if (obj.content.extend && obj.content.extend.searchButtonInfo) {
        delete obj.content.extend.searchButtonInfo;
      }
    }

    // 重新序列化为字符串返回
    body = JSON.stringify(obj);
  } catch (e) {
    console.log("途家去广告脚本执行异常: " + e);
  }
}

$done({ body });
