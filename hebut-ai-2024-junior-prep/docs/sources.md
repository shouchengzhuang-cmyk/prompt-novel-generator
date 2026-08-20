# 来源记录

更新时间：2026-08-20。

## 官方培养方案

- 河北工业大学人工智能与数据科学学院：2024 级本科生培养方案页面  
  `https://ai.hebut.edu.cn/rcpy/bkspy/pyfa/4824287173d74c6087e603e25ea4bc26.htm`
- 培养方案 PDF  
  `https://ai.hebut.edu.cn/docs/2025-09/7befdc9d459c46f6a84167a7fc35c911.pdf`

用于确认第 5、6 学期课程、实验学时和集中实践量。

## 数据挖掘历届材料

- 实验一：数据预处理  
  `https://blog.csdn.net/d33332/article/details/127209728`
- 实验二：数据立方体与 OLAP  
  `https://blog.csdn.net/d33332/article/details/127245436`
- 实验三：Apriori 频繁项集挖掘  
  `https://blog.csdn.net/d33332/article/details/127245661`
- 实验四、五序列旁证：贝叶斯决策分类、K-means 聚类  
  由同系列河工大公开材料确认。

这些页面用于确认题型、字段和历史报告结构。本库代码、样例数据和文字均重新编写。

## 2026 年近届公开 GitHub 材料

### 深度学习

- `auutuumn0017/DeepLearning_Experiment`
- 仓库描述：`hebut 大三下深度学习实验`
- 可见文件：`Exp1.ipynb`、`Exp2.ipynb`、`深度学习实验要求.docx`
- 用途：确认自动求导/梯度截断，以及 FNN 多任务、激活函数、学习率和 K 折等任务结构。

### 计算机视觉

- `auutuumn0017/CV-Experiment`
- 仓库描述：`大三下机器视觉实验`
- 用途：确认车道线检测的 5 图×4 参数结果结构，以及 CIFAR-10 传统方法/CNN 对比、混淆矩阵、损失曲线和错误样例。

### 机器学习系统与平台实践

- `auutuumn0017/Hebut-Machine_Learning_Platform`
- README 明确写 `Hebut-机器学习系统与平台实践`、MNIST、三种方法与前端设计；
- 代码包含 MLP、CNN、RNN/LSTM、训练、Flask 推理和前端。
- `auutuumn0017/Hebut-Sharing` 中另有同课程 `tips.docx` 与 `实验报告.pdf`。

### 缺失数据填补

- `auutuumn0017/DataAnalysis-Exp2-MissingData`
- 可见产物：20/40/60% 缺失率评估矩阵，均值/KNN/自编码器填补，LR/SVM/RF/MLP 下游模型，F1/nF1 图表与填补 CSV。
- 用途：确认近届结果密集型实验的交付形态。
- 限制：尚未确认它对应本培养方案中的哪门正式课程。

### 中文情感分类与 KG/RAG

- `auutuumn0017/DataAnalysis-Exp3-NLP`
- 可见产物：ChnSentiCorp 参数跑批日志、comparison CSV、知识图谱 HTML、报告图片；
- 数据说明明确每位学生按学号采样 4000 条，KG/RAG 实验按组提供和补充三元组/文档。
- 限制：路径提示可能属于“大数据分析与可视化”实验，只作为 NLP 候选题型和结果形态旁证。

## 相近课程旁证

- 河北工业大学其他专业《模式识别》实验：`ZiFengQiao/hebut_course_pattern_recognition`

README 明确说明它属于电子信息工程学院通信工程大四选修课，不是人工智能专业 2024 级同一课程，只作为题型和报告组织旁证。

## 处理原则

- 不收录历届学生姓名、学号和可直接改名提交的报告；
- 不复制学生代码、权重或历史运行数字；
- 不把公开学生仓库称为教师官方答案；
- 仅记录任务结构、输出形态和可验证事实；
- 本库的实现和报告流水线重新设计；
- 正式提交必须以当届教师要求为准并重新运行。
