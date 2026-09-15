import "../customer/customer.css";
import Link from "next/link";

export function MockLogin() {
  return <main className="invite-entry">
    <Link className="invite-entry__brand" href="/">VisionQA</Link>
    <section className="invite-entry__panel" aria-labelledby="mock-login-title">
      <div className="invite-entry__copy"><span>本地产品原型 · MOCK</span><h1 id="mock-login-title">登录后，在对话里完成商品视觉工作。</h1><p>这是登录与工作台链路的交互演示，不验证真实账号，不接收密码，不消耗模型额度。</p></div>
      <div className="invite-entry__form">
        <form action="/api/local-agent/mock-session" method="post"><label htmlFor="mock-name">体验昵称（不需要真实姓名）</label><input id="mock-name" name="nickname" placeholder="例如：体验用户" maxLength={40} required /><button type="submit">模拟登录并进入工作台</button></form>
        <div className="mock-test-entry" style={{ borderTop: "1px solid #ddd", paddingTop: 24, marginTop: 24 }}><h2 style={{ fontSize: 16 }}>测试体验入口</h2><p>不填写账号，直接走完示例商品流程。模拟记录仅保存在当前浏览器，与原工作台隔离。</p><form action="/api/local-agent/mock-session" method="post"><input type="hidden" name="nickname" value="测试体验" /><button className="invite-entry__dev" type="submit">直接进入模拟测试</button></form></div>
        <p className="invite-entry__fineprint">本入口不是正式身份认证。真实登录与模型服务会在交互验收后接入。</p>
      </div>
    </section>
  </main>;
}
