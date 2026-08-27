"use client";

import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type { CustomerProfileInput } from "../lib/visionqa/api-client";

type WorkspaceBaselineProps = {
  referenceFiles: File[];
  setReferenceFiles: (files: File[]) => void;
  customerProfile: CustomerProfileInput;
  setCustomerProfile: Dispatch<SetStateAction<CustomerProfileInput>>;
  onContinue: () => void;
};

const styleOptions = ["简约通勤", "轻奢质感", "甜酷潮流", "自然松弛", "高级极简"];
const profileGroups: Array<{
  key: "ageRanges" | "genderProfiles" | "cityTiers" | "audienceSegments" | "scenarios" | "purchaseDrivers";
  label: string;
  hint: string;
  options: string[];
}> = [
  { key: "ageRanges", label: "年龄区间", hint: "可多选", options: ["18–23 岁", "24–30 岁", "31–40 岁", "41–50 岁", "51–60 岁", "60 岁以上", "不限年龄"] },
  { key: "genderProfiles", label: "性别画像", hint: "由客户确认，不从图片推断", options: ["女性为主", "男性为主", "中性／不限", "家庭共同决策"] },
  { key: "cityTiers", label: "城市分布", hint: "营销目标，不代表平台真实数据", options: ["一线城市", "新一线城市", "二线城市", "三线城市", "四线及以下", "县域／乡镇市场", "不限城市"] },
  { key: "audienceSegments", label: "人群类型", hint: "接近投放后台的业务标签", options: ["Z 世代", "都市白领", "都市银发", "小镇青年", "小镇蓝领", "精致妈妈", "新锐中产", "品质家庭", "通勤女性", "学生人群", "大码服饰人群"] },
  { key: "scenarios", label: "消费场景", hint: "用于痛点和脚本生成", options: ["通勤", "约会", "旅行", "居家", "轻运动", "宴会", "节庆"] },
  { key: "purchaseDrivers", label: "决策驱动", hint: "只使用客户确认的商品事实", options: ["版型", "颜色", "材质细节", "搭配效率", "场景适配", "品牌感", "价格敏感"] },
];

export function WorkspaceBaseline({
  referenceFiles,
  setReferenceFiles,
  customerProfile,
  setCustomerProfile,
  onContinue,
}: WorkspaceBaselineProps) {
  const previews = useMemo(
    () => referenceFiles.map((file) => ({ file, src: URL.createObjectURL(file) })),
    [referenceFiles],
  );

  useEffect(
    () => () => previews.forEach((preview) => URL.revokeObjectURL(preview.src)),
    [previews],
  );

  const toggleTag = (
    field: "styles" | "ageRanges" | "genderProfiles" | "cityTiers" | "audienceSegments" | "scenarios" | "purchaseDrivers",
    value: string,
  ) => {
    setCustomerProfile((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
      ...(field === "audienceSegments"
        ? {
            audiences: current.audiences.includes(value)
              ? current.audiences.filter((item) => item !== value)
              : [...current.audiences, value],
          }
        : {}),
    }));
  };

  const hasBaseline = referenceFiles.length > 0 || customerProfile.skuLinks.length > 0 || (customerProfile.skuFacts ?? []).length > 0;

  return (
    <section className="workspace-page baseline-page" aria-labelledby="baseline-title">
      <header className="page-heading baseline-heading">
        <div>
          <p className="page-context">第一步 · 商品真值</p>
          <h1 id="baseline-title">先告诉系统，什么是这个商品。</h1>
          <p>上传真实产品白底图、细节图或官方确认稿。后续修正以它们作为颜色、版型、图案、Logo 和材质的唯一商品依据。</p>
        </div>
        <button className="primary-button" type="button" onClick={onContinue}>
          下一步：上传 AI 模特草图
        </button>
      </header>

      <div className="baseline-stage-layout">
        <div className="baseline-primary">
      <div className="baseline-input-layout">
        <section className="baseline-link-sheet" aria-labelledby="sku-link-title">
          <div className="input-route-heading">
            <span>A</span>
            <div>
              <h2 id="sku-link-title">粘贴历史商品 SKU 链接</h2>
              <p>支持一个或多个商品详情链接，每行一个。</p>
            </div>
          </div>
          <label className="field-stack">
            <span>商品链接</span>
            <textarea
              rows={7}
              value={customerProfile.skuLinks.join("\n")}
              placeholder={"https://detail.tmall.com/item.htm?id=...\nhttps://item.jd.com/..."}
              onChange={(event) =>
                setCustomerProfile((current) => ({
                  ...current,
                  skuLinks: event.target.value
                    .split(/\r?\n/)
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .slice(0, 20),
                }))
              }
            />
          </label>
          <label className="csv-import baseline-csv-import">
            导入 SKU 链接 CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                const values = (await file.text())
                  .split(/[\r\n,]+/)
                  .map((item) => item.trim())
                  .filter((item) => /^https?:\/\//i.test(item));
                setCustomerProfile((current) => ({ ...current, skuLinks: values.slice(0, 20) }));
                event.currentTarget.value = "";
              }}
            />
          </label>
          <p className="input-route-status">已加入 {customerProfile.skuLinks.length} 个 SKU 链接</p>
          <label className="field-stack">
            <span>确认过的商品事实</span>
            <textarea
              rows={5}
              value={(customerProfile.skuFacts ?? []).join("\n")}
              placeholder={"每行一条，例如：\n纽扣总数：4\n正确刺绣：左胸 1 枚\n右胸无刺绣"}
              onChange={(event) =>
                setCustomerProfile((current) => ({
                  ...current,
                  skuFacts: event.target.value
                    .split(/\r?\n/)
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .slice(0, 24),
                }))
              }
            />
          </label>
        </section>

        <section className="baseline-image-sheet" aria-labelledby="reference-image-title">
          <div className="input-route-heading">
            <span>B</span>
            <div>
              <h2 id="reference-image-title">上传商品白底图或官方确认稿</h2>
              <p>最多 4 张，优先正面、背面、侧面和关键细节。</p>
            </div>
          </div>
          <label className="baseline-dropzone">
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                setReferenceFiles(Array.from(event.currentTarget.files ?? []).slice(0, 4));
                event.currentTarget.value = "";
              }}
            />
            <strong>{referenceFiles.length ? "更换商品真值图" : "选择商品真值图"}</strong>
            <span>JPG、PNG、WebP · 单批最多 4 张</span>
          </label>
          <div className="baseline-preview-strip" aria-live="polite">
            {previews.length ? (
              previews.map((preview, index) => (
                <figure key={`${preview.file.name}-${preview.file.size}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview.src} alt={`商品真值图 ${index + 1}`} />
                  <figcaption>{preview.file.name}</figcaption>
                </figure>
              ))
            ) : (
              <div className="baseline-empty-preview">
                <span>暂无商品真值图</span>
                <p>未上传时，系统不会把示例图当作客户商品依据。</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="baseline-boundary" role="note">
        <strong>商品真值不会自动形成通过结论</strong>
        <p>SKU 链接尚未抓取时只记录为输入；局部图片不能扩张为完整 SKU 通过，Logo 和字标仍需官方资产确认。</p>
      </section>
        </div>

        <aside className="profile-sidebar" aria-labelledby="baseline-context-title">
          <div className="profile-sidebar-status">
            <span>商品策略</span>
            <strong>{hasBaseline ? "商品真值已建立" : "开始诊断前需补齐"}</strong>
          </div>
          <h2 id="baseline-context-title">目标人群与表达方向</h2>
          <p>这些信息只用于校准商业表达，不从模特照片推断人群属性。</p>

          <dl className="profile-sidebar-summary">
            <div>
              <dt>目标风格</dt>
              <dd>{customerProfile.styles.join("、") || "待选择"}</dd>
            </div>
            <div>
              <dt>价格带</dt>
              <dd>{customerProfile.priceMin || "?"}–{customerProfile.priceMax || "?"} 元</dd>
            </div>
            <div>
              <dt>核心人群</dt>
              <dd>{customerProfile.audienceSegments.join("、") || "待选择"}</dd>
            </div>
            <div>
              <dt>使用场景</dt>
              <dd>{customerProfile.scenarios.join("、") || "待选择"}</dd>
            </div>
          </dl>

          <details className="profile-editor">
            <summary>编辑商品策略与人群画像</summary>
            <div className="profile-editor-content">
              <fieldset className="tag-field">
                <legend>目标风格</legend>
                <div>{styleOptions.map((option) => (
                  <button key={option} type="button" aria-pressed={customerProfile.styles.includes(option)} onClick={() => toggleTag("styles", option)}>{option}</button>
                ))}</div>
              </fieldset>
              <div className="price-range baseline-price-range">
                <label><span>最低价</span><input inputMode="numeric" value={customerProfile.priceMin} onChange={(event) => setCustomerProfile((current) => ({ ...current, priceMin: event.target.value.replace(/[^0-9.]/g, "") }))} /></label>
                <span>至</span>
                <label><span>最高价</span><input inputMode="numeric" value={customerProfile.priceMax} onChange={(event) => setCustomerProfile((current) => ({ ...current, priceMax: event.target.value.replace(/[^0-9.]/g, "") }))} /></label>
              </div>
              <div className="profile-editor-groups" aria-label="目标人群画像标签">
                {profileGroups.map((group) => (
                  <fieldset className="tag-field audience-tag-field" key={group.key}>
                    <legend>{group.label}<small>{group.hint}</small></legend>
                    <div>
                      {group.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={customerProfile[group.key].includes(option)}
                          onClick={() => toggleTag(group.key, option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </div>
          </details>
        </aside>
      </div>
    </section>
  );
}
