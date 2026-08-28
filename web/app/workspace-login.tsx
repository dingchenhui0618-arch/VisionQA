"use client";

type WorkspaceLoginProps = {
  onEnterPreview: () => void;
};

export function WorkspaceLogin({ onEnterPreview }: WorkspaceLoginProps) {
  return (
    <main className="workspace-login-shell">
      <section className="login-brand-panel" aria-labelledby="login-title">
        <div className="login-brand-mark" aria-label="VisionQA">
          <span>VQ</span>
          <strong>VisionQA</strong>
        </div>
        <div className="login-statement">
          <p>服饰电商 AI 商品图修正</p>
          <h1 id="login-title">看清问题，修好再交付。</h1>
          <ol aria-label="试用流程">
            <li><span>1</span>选择商品真值和待修图片</li>
            <li><span>2</span>确认问题与修改边界</li>
            <li><span>3</span>对比结果并人工放行</li>
          </ol>
        </div>
        <p className="login-governance">人工终审始终开启</p>
      </section>

      <section className="login-form-panel" aria-label="试用 VisionQA">
        <div className="login-form-wrap trial-entry">
          <div className="login-form-heading">
            <span>在线试用</span>
            <h2>先用一个案例试试</h2>
            <p>无需注册。进入后可直接体验问题判断、修正边界和前后复验。</p>
          </div>

          <button className="trial-start-button" type="button" onClick={onEnterPreview}>
            开始试用
            <span aria-hidden="true">→</span>
          </button>

          <ul className="trial-assurances" aria-label="试用说明">
            <li><strong>无需登录</strong><span>当前版本不保存账号或密码</span></li>
            <li><strong>本机保存</strong><span>试用项目保存在当前浏览器</span></li>
            <li><strong>人工确认</strong><span>系统不会自动放行图片</span></li>
          </ul>

          <p className="trial-boundary">公开试用用于验证流程，不代表模型准确率或商业效果。</p>
        </div>
      </section>
    </main>
  );
}
