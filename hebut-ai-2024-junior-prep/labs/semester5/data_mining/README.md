# 数据挖掘：历届题型预制

## 证据等级

**高置信度历史题型，不保证 2024 级原题复用。**

公开的河北工业大学历届材料形成了连续三次实验：

1. 多商店销售数据预处理；
2. 商品类别 × 商店 × 日期的数据立方体与 OLAP 查询；
3. Apriori 频繁项集挖掘。

本目录使用自造小数据，代码为重新实现。

## 运行

```bash
python labs/semester5/data_mining/lab01_preprocessing.py
python labs/semester5/data_mining/lab02_olap_cube.py
python labs/semester5/data_mining/lab03_apriori.py --min-support 2
```

## 等正式题目发布后重点核对

- 字段中文名/英文名与文件编码；
- 缺失日期的明确补全规则；
- 负数是录入错误、退货还是必须取绝对值；
- 商品类别是否仍取商品编码前五位；
- 立方体聚合值是销售额、数量还是两者；
- Apriori 的最小支持度是计数还是比例；
- 是否禁止调用现成关联规则库。
