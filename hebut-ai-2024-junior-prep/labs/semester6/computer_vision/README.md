# 计算机视觉：上一届题型预制

## 证据等级

**高置信度历史题型，不保证 2024 级原题复用。**

上一届公开仓库明确标注“大三下机器视觉实验”，可见两次实验：

### 实验 1：车道线检测

- BDD100K 与 KITTI Road 图像；
- 图像尺寸、通道、像素范围；
- 灰度化、高斯滤波、Canny；
- ROI 感兴趣区域；
- Hough 直线检测；
- 5 张图、多组参数对比；
- 进阶拟合与视频拓展。

本库脚本：

```bash
python labs/semester6/computer_vision/lane_detection.py \
  --input data/road_images \
  --output artifacts/computer_vision/lane
```

### 实验 2：CIFAR-10 图像分类

- 传统方法：HOG、颜色直方图、SVM/KNN；
- 深度方法：CNN；
- 准确率、宏平均 F1、混淆矩阵；
- 损失曲线与错误样本。

```bash
python labs/semester6/computer_vision/cifar_comparison.py \
  --mode both --download --epochs 5
```

默认参数刻意偏小，先验证流程；正式报告再按要求扩大数据与训练轮数。

## 数据边界

本库不携带 BDD100K、KITTI 或 CIFAR-10 数据。请从正式课程附件或数据集官方渠道获取，并确认许可与目录结构。
