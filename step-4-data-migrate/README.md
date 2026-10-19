# MongoDB 商品数据迁移

## 配置

`src/config.ts` 中两个流程分别配置：

```ts
// data_completion → products.detail
export const FILTER = { needsReview: false };

// data_completion_zh → product_translations
export const TRANSLATION_FILTER = {
  needsReview: false,
  "translation.status": "completed",
};
```

可添加 `productId`、重试版本、完成标记、日期等任意 MongoDB 查询条件。**`{}` 表示不筛选、迁移集合中所有记录**，不会自动追加成功状态，也不会根据目标最大 ID 跳过历史记录。语言、翻译集合分别由 ACTIVE_TRANSLATION_LANG / TRANSLATION_COLLECTIONS 配置；普通来源集合由 SOURCE_DATABASE / SOURCE_COLLECTION 配置。

## 执行

使用 `../step-1-data-crawl/.env` 中的 MONGODB_URI 和 SUPABASE_DB_URL：

```sh
npm run sync
npm run sync:translations
npm run sync -- --limit 100
npm run sync:translations -- --limit 100
```

两个命令都直接写库，没有预览模式。每批最多 BATCH_SIZE（默认 100）条，`--limit` 只限制本次读取总量，不是每批数量。未知 CLI 参数会报错。

## 更新及重复执行

- 普通 sync 按 MongoDB productId 对应 products.id，完整替换 **detail 列**（不是 JSON 合并），不会覆盖 products 的 name、brand 等基础字段。products 不存在对应 ID 时整批回滚，不凭 MongoDB 补全数据创建不完整商品。
- translation 按 product_id + lang upsert：不存在则新增，存在则完整替换 **name 和 detail**，保留已有 id；无需 grocer_id 或外键校验。
- “增量”通过 filter 明确限定本次待迁移数据。重复执行相同 filter 会再次更新全部匹配记录，不自动跳过已迁移商品；因此能同步 MongoDB 中已有商品的修改和字段删除。不保存最大 ID 或隐式断点；相同 `--limit` 会再次处理前 N 条。
- 每批使用 PostgreSQL 事务。失败时回滚当前批，之前已提交批不回滚；修复后可直接重跑。源数据 productId 必须为正整数且唯一，detail 必须为对象，翻译还要求 product_name 非空；非法记录会报错停止，不会静默过滤或覆盖目标。空 filter 也不绕过这些校验。
- 只清理并写入 EXCLUDED_FIELDS 之外的 payload；译文额外排除 translation 元数据。MongoDB 原集合不做更新，也不会删除目标中不匹配本次 filter 的记录。

验证：`npm test` 使用离线假连接，不写入实际数据库；`npm run typecheck` 检查类型。
