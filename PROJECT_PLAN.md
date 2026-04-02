# 项目规划

## 当前目标

围绕现有的三个核心功能继续演进：

- 蛋组查询
- 炫彩继承
- 求蛋广场

接下来的重点不是继续堆页面，而是先把数据底座做稳。原因很明确：

- 精灵进化前后名称会变化
- 同一编号下可能存在多个不同形态
- 仅靠 `name + groups` 的平铺结构，后续很难正确支持炫彩继承、进化链、形态展示和图鉴扩展

因此，下一阶段的核心任务是：**把当前单层宠物 JSON 升级为“精灵本体 + 形态实例 + 进化关系 + 蛋组映射”的规范化结构。**

---

## 里程碑

### M1 数据规范化底座

目标：把现有 `data/pets.json` 从“名字即主键”的结构，升级成可支撑进化、形态、继承和图鉴扩展的数据模型。

#### M1-1 建立新的数据分层

- [ ] 新增 `species` 层
  - 表示精灵本体
  - 用稳定编号作为核心标识，不再依赖中文名做唯一键
- [ ] 新增 `forms` 层
  - 表示同一精灵的不同形态、地区形态、首领形态等
  - 允许“同编号、同名字、不同展示形态”共存
- [ ] 新增 `evolutions` 层
  - 表示不同编号之间的进化关系
  - 支持一段式、多段式以及未来可能的分支进化
- [ ] 新增 `eggGroupMappings` 层
  - 把蛋组信息从当前平铺宠物数据中拆出来
  - 允许后续按 `species` 或 `form` 决定蛋组归属

#### M1-2 新 JSON 结构设计

建议拆成以下文件：

- [ ] `data/species.json`
- [ ] `data/forms.json`
- [ ] `data/evolutions.json`
- [ ] `data/egg-groups.json`
- [ ] `data/runtime-pets.json`

说明：

- `species.json`
  - 存精灵本体
  - 重点字段：
    - `speciesId`
    - `name`
    - `lineId`
    - `element`
    - `defaultFormId`
- `forms.json`
  - 存每个形态实例
  - 重点字段：
    - `formId`
    - `speciesId`
    - `displayName`
    - `formName`
    - `stage`
    - `tags`
    - `image`
- `evolutions.json`
  - 存进化边
  - 重点字段：
    - `fromSpeciesId`
    - `toSpeciesId`
    - `condition`
- `egg-groups.json`
  - 存蛋组归属
  - 重点字段：
    - `speciesId` 或 `formId`
    - `groups`
- `runtime-pets.json`
  - 给当前前端直接消费的兼容视图数据
  - 避免一次性重写全部页面

#### M1-3 主键策略

- [ ] 不再使用中文名称作为唯一主键
- [ ] 统一以 `speciesId` 作为精灵本体标识
- [ ] 统一以 `formId` 作为具体展示形态标识
- [ ] 同一进化线增加 `lineId`

建议规则：

- `speciesId`
  - 直接来自图鉴编号
  - 如：`011`
- `formId`
  - `speciesId + 形态标识`
  - 如：`011-default`
  - 如：`011-relaxed`
  - 如：`011-sleepy`
- `lineId`
  - 同一进化线公用
  - 如：`line-duck-011`

这样可以解决：

- 不同编号不同名字的进化链问题
- 同编号同名字不同形态的区分问题
- 图片、继承、图鉴展示都不再依赖中文名硬匹配

---

### M2 图鉴数据采集与清洗

目标：把你后续爬下来的图鉴数据变成结构稳定、可持续维护的标准数据。

#### M2-1 原始数据采集

- [ ] 编写爬取脚本抓取图鉴页
- [ ] 保留原始导出文件，单独存放
- [ ] 原始数据建议放在：
  - `data/raw/pokedex.json`

建议采集字段：

- [ ] 图鉴编号
- [ ] 精灵名称
- [ ] 形态名称
- [ ] 阶段信息
- [ ] 属性信息
- [ ] 图片地址
- [ ] 图鉴详情页地址
- [ ] 是否地区形态 / 首领形态 / 特殊形态

#### M2-2 数据清洗

- [ ] 把编号标准化成固定字符串格式
  - 如 `001`、`011`
- [ ] 清理名称中的无意义空格和特殊符号
- [ ] 把形态名和本体名拆开
- [ ] 给无形态的条目标记为 `default`
- [ ] 给每条记录补 `speciesId`、`formId`

#### M2-3 进化链整理

- [ ] 根据编号顺序和图鉴关系建立初步进化边
- [ ] 对无法自动判断的条目标记为待人工确认
- [ ] 单独维护一个人工修正规则表

建议新增：

- [ ] `data/manual/evolution-overrides.json`

用途：

- 修正自动判断错误
- 补特殊进化
- 处理跳编号、支线进化、特殊形态不进化等情况

---

### M3 蛋组数据融合

目标：把现有蛋组数据与新图鉴结构合并，而不是直接用名字硬拼。

#### M3-1 当前蛋组数据迁移

- [ ] 从现有 `data/pets.json` 提取蛋组信息
- [ ] 建立旧名称与新 `speciesId/formId` 的映射
- [ ] 无法自动匹配的条目进入人工校对

建议新增：

- [ ] `data/manual/name-mapping.json`

用途：

- 把旧站数据中的中文名映射到新结构
- 解决改名、同名不同形态、旧别名等问题

#### M3-2 蛋组归属规则

需要提前明确：

- [ ] 蛋组是归到 `species` 还是归到 `form`
- [ ] 如果同一精灵多个形态蛋组一致，优先挂到 `species`
- [ ] 如果存在形态差异，再细分到 `form`

推荐策略：

- 默认按 `species` 归属
- 仅在特殊形态确实不同蛋组时，覆盖到 `form`

这样维护成本最低。

---

### M4 前端兼容改造

目标：在不一次性推翻现有前端的情况下，把新数据逐步接入。

#### M4-1 兼容运行时视图

- [ ] 先生成一份 `runtime-pets.json`
- [ ] 字段尽量兼容现有页面
- [ ] 至少保留：
  - `id`
  - `name`
  - `groups`
  - `image`

同时补充：

- [ ] `speciesId`
- [ ] `formId`
- [ ] `lineId`
- [ ] `stage`
- [ ] `formName`

#### M4-2 蛋组查询适配

- [ ] 查询页继续按当前卡片模式工作
- [ ] 但内部主键改成 `formId` 或 `speciesId`
- [ ] 点击卡片时不再依赖名称做唯一定位

#### M4-3 炫彩继承适配

- [ ] 明确继承计算到底按 `species` 还是 `form` 执行
- [ ] 起点选择优先支持具体形态
- [ ] 目标计算结果里显示：
  - 本体名
  - 形态名
  - 继承路径

建议方向：

- 当前先按 `species` 级别建立继承图
- 页面展示时再映射到具体 `form`

这样路径不会因为形态膨胀得太复杂。

#### M4-4 图鉴展示适配

- [ ] 后续图鉴页可以按 `species` 聚合
- [ ] 展开后再展示 `forms`
- [ ] 进化链视图使用 `lineId + evolutions`

---

### M5 图片资源迁移

目标：让图片路径稳定，不再依赖中文文件名。

#### M5-1 图片命名改造

- [ ] 逐步把现有 `pet-img/中文名.png`
  改为
  `pet-img/formId.png`

例如：

- [ ] `011-default.png`
- [ ] `011-relaxed.png`
- [ ] `011-sleepy.png`

#### M5-2 前端图片字段改造

- [ ] 数据里直接写 `image`
- [ ] 前端不再用 `name + .png` 拼路径
- [ ] 图片回退逻辑保留占位图

---

### M6 数据处理脚本

目标：让后续更新图鉴数据和蛋组数据时不靠手工硬改。

建议增加脚本目录：

- [ ] `scripts/import-pokedex.js`
- [ ] `scripts/normalize-pets.js`
- [ ] `scripts/merge-egg-groups.js`
- [ ] `scripts/build-runtime-pets.js`

建议处理流程：

1. 爬取原始图鉴数据
2. 规范化成 `species/forms/evolutions`
3. 合并蛋组数据
4. 输出前端运行时 JSON

这样以后更新新精灵、新形态时成本会低很多。

---

## 建议字段样例

### species.json

```json
{
  "speciesId": "011",
  "name": "鸭吉吉",
  "lineId": "line-011",
  "defaultFormId": "011-default",
  "element": ["普通"]
}
```

### forms.json

```json
{
  "formId": "011-default",
  "speciesId": "011",
  "displayName": "鸭吉吉",
  "formName": "默认",
  "stage": 1,
  "tags": [],
  "image": "/pet-img/011-default.png"
}
```

### forms.json（同编号不同形态）

```json
{
  "formId": "011-relaxed",
  "speciesId": "011",
  "displayName": "鸭吉吉·蓬松的样子",
  "formName": "蓬松的样子",
  "stage": 1,
  "tags": ["special-form"],
  "image": "/pet-img/011-relaxed.png"
}
```

### evolutions.json

```json
{
  "fromSpeciesId": "002",
  "toSpeciesId": "003",
  "condition": null
}
```

### egg-groups.json

```json
{
  "speciesId": "011",
  "groups": ["某蛋组"]
}
```

---

## 实施顺序建议

推荐按下面顺序推进：

1. 先做原始图鉴数据爬取
2. 建 `species/forms/evolutions` 三层结构
3. 做 `name-mapping`，把旧蛋组数据映射进去
4. 输出 `runtime-pets.json`
5. 再逐步把前端从旧 `pets.json` 切到新结构

不要一上来直接全站替换，否则很容易同时打坏：

- 蛋组查询
- 炫彩继承
- 图片展示
- 求蛋广场中的宠物名称引用

---

## 当前结论

这次数据结构升级的核心判断是：

- **编号** 作为精灵本体主键
- **同编号不同形态** 作为 form 实例
- **不同编号进化关系** 作为 evolution edges
- **蛋组数据** 作为独立映射层融合

这样后面无论是：

- 进化前后名称变化
- 同名不同形态
- 炫彩继承路径
- 蛋外观展示
- 图鉴扩展

都会稳定很多。
