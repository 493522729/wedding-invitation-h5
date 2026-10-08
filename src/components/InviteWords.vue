<script setup lang="ts">
/**
 * 邀请辞模块。
 *
 * 排在倒计时之后、照片之前 —— 文案是引子，照片是答案：
 * 宾客读完「愿有你们见证」，紧接着看到的就是那段美好。
 * 而实用的时间地点挪到照片之后，先给情绪再给信息。
 *
 * 文案从传统请柬的六句压到四句：原版里
 * 「与您一同分享此刻的美好」与末句「见证并分享美好时刻」语义重复，
 * 「收到这封邀请函的亲人朋友」「这样特殊的一天」是纯连接句、没有信息量，
 * 删掉后节奏才收得住。
 */
</script>

<template>
  <section class="words">
    <h2 class="w-title">诚挚邀请</h2>
    <span class="w-rule" aria-hidden="true"></span>

    <p class="w-line">世间所有的相遇，都是久别重逢</p>
    <p class="w-line">心有所爱，才敢笃定未来</p>

    <span class="w-gap" aria-hidden="true"></span>

    <p class="w-line">感谢你们陪伴我们走过许多岁月</p>
    <p class="w-line">愿这一天，有你们共同见证</p>
  </section>
</template>

<style scoped>
/*
 * 毛玻璃比终端、信息卡更透一档（0.5vs 0.66）。
 * 这块是纯文字模块、没有图片压着，透一点能看到背景照片的层次，
 * 视觉上更透气；数字模块若同样调透，照片会干扰读数。
 * 模糊反而加到 18px —— 透指的是底色淡，磨砂感要更强，两者不是一回事。
 */
.words {
  background: rgba(17, 22, 31, 0.5);
  -webkit-backdrop-filter: blur(18px) saturate(1.35);
  backdrop-filter: blur(18px) saturate(1.35);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 14px;
  margin: 14px 16px 0;
  padding: 24px 18px 22px;
  text-align: center;
  /* 毛玻璃叠重阴影会显脏，这里只用极淡的一层 */
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.3);
}
.w-title {
  margin: 0;
  /* 霞鹜文楷：楷体比宋体有书卷气，更贴近传统请帖 */
  font-family: var(--font-invite);
  font-size: 26px;
  font-weight: 400;
  /* 楷体笔画比黑体疏，字距可以再放开些 */
  letter-spacing: 8px;
  /* letter-spacing 会在末字后也留空，往左补一点让视觉居中 */
  text-indent: 8px;
  color: #e8c27a;
}
.w-rule {
  display: block;
  width: 34px;
  height: 1px;
  margin: 12px auto 18px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(232, 194, 122, 0.65),
    transparent
  );
}
.w-line {
  margin: 0 0 9px;
  font-family: var(--font-invite);
  font-size: 15.5px;
  /* 楷体本身有笔画粗细变化，行高要更松才不显拥挤 */
  line-height: 2;
  letter-spacing: 1.5px;
  /* 底色比终端浅，字色相应加深一点保证对比 */
  color: #dbe3ec;
}
.w-line:last-child {
  margin-bottom: 0;
}
/* 两句一组之间的留白，替代原来的空行分隔句 */
.w-gap {
  display: block;
  height: 16px;
}
</style>
