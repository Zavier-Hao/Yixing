# 弈星桌宠关键帧

基于用户提供的动作图集，使用内置 imagegen 做背景提取，再用 `scripts/pack_pet_frames.py` 对齐并打包透明帧。没有用 CSS 旋转整张静态图片冒充翻滚。

源图可见关键帧实际为：呼吸 8、奔跑 8、翻滚 10、摸头 8、被捏起 9、释放 8，共 51 帧。原图的翻滚、拖拽行存在编号跳号，程序按实际可见帧播放。图集是排版预览，提取结果的边缘和细节可能与单独的原始 PNG 帧有差异。

`dist/assets/pet-frames/` 保留每张 256×256 透明 PNG；网页一次加载 `atlas.webp`，避免播放过程中逐张下载造成闪烁。画面实际显示尺寸约 146px，不额外放大成虚假的 512px 高清素材。帧率按动作单独配置；呼吸停留更久，奔跑连续循环，摸头和落地播放一次后回到待机。书本待机帧同时用于阅读和聊天。

拖拽继续使用原有指针捕获与边界限制。松手后先下落，首次触地才开始落地序列，弹性物理和动作都结束后再回待机。减少动态效果模式固定关键帧并保留按钮和拖拽操作。

## 背景提取提示词（内置 imagegen）

Edit target: supplied sprite reference atlas. Background extraction only, preserve ALL owl character keyframes exactly, same positions and relative sizes, same six horizontal rows and number of visible sprites in each row (8 idle,8 run,10 roll,8 pet,9 drag,8 release). Remove ALL dark background, text, labels, frame numbers, separators and entire right-side panels. Leave only the six rows of character sprites on actual transparent background in the left 78% of canvas, unchanged positions, same 1536x1024 composition. Keep the hand in drag row and hearts and dust belonging to sprites. Do not redesign, do not add frames, do not rearrange, do not crop any character. This is a precise existing keyframe extraction for production sprite animation.
