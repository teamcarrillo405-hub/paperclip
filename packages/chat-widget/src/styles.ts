export function widgetHostStyles(): string {
  return `
    .avero-chat-root {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .avero-chat-bubble {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      transition: transform 0.15s ease;
    }
    .avero-chat-bubble:hover { transform: scale(1.05); }
    .avero-chat-bubble svg { width: 26px; height: 26px; }
    .avero-chat-frame {
      position: absolute;
      bottom: 80px;
      right: 0;
      width: 360px;
      height: 560px;
      max-width: calc(100vw - 24px);
      max-height: calc(100vh - 100px);
      border: none;
      border-radius: 14px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      background: #fff;
      display: none;
    }
    .avero-chat-frame.open { display: block; }
    @media (max-width: 480px) {
      .avero-chat-root { bottom: 12px; right: 12px; }
      .avero-chat-frame {
        position: fixed;
        bottom: 0; right: 0; left: 0; top: 0;
        width: 100vw;
        height: 100vh;
        max-width: 100vw;
        max-height: 100vh;
        border-radius: 0;
      }
    }
  `;
}

export function iframeDocumentStyles(brandColor: string): string {
  return `
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
      background: #fff;
    }
    .chat-app { display: flex; flex-direction: column; height: 100%; }
    .chat-header {
      background: ${brandColor};
      color: #fff;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .chat-avatar {
      width: 36px; height: 36px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      display: flex; align-items: center; justify-content: center;
      font-weight: 600;
      font-size: 14px;
    }
    .chat-title { font-size: 15px; font-weight: 600; line-height: 1.2; }
    .chat-subtitle { font-size: 12px; opacity: 0.85; }
    .chat-close {
      margin-left: auto;
      background: transparent;
      border: none;
      color: #fff;
      font-size: 22px;
      cursor: pointer;
      opacity: 0.85;
    }
    .chat-close:hover { opacity: 1; }
    .chat-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #f9fafb;
    }
    .msg {
      max-width: 80%;
      padding: 10px 12px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.4;
      word-wrap: break-word;
      white-space: pre-wrap;
    }
    .msg-agent { align-self: flex-start; background: #fff; border: 1px solid #e5e7eb; color: #111827; border-bottom-left-radius: 4px; }
    .msg-visitor { align-self: flex-end; background: ${brandColor}; color: #fff; border-bottom-right-radius: 4px; }
    .msg-system { align-self: center; font-size: 12px; color: #6b7280; background: transparent; }
    .typing { display: inline-flex; gap: 4px; align-items: center; padding: 10px 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; align-self: flex-start; }
    .typing span {
      width: 6px; height: 6px; border-radius: 50%; background: #9ca3af;
      animation: blink 1.2s infinite both;
    }
    .typing span:nth-child(2) { animation-delay: 0.2s; }
    .typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }
    .chat-footer {
      border-top: 1px solid #e5e7eb;
      padding: 10px;
      background: #fff;
    }
    .lead-form { display: flex; flex-direction: column; gap: 8px; padding: 4px; }
    .lead-form p { margin: 0 0 4px; font-size: 13px; color: #374151; }
    .lead-form input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
    }
    .lead-form input:focus { outline: 2px solid ${brandColor}; outline-offset: -1px; border-color: transparent; }
    .btn-primary {
      background: ${brandColor};
      color: #fff;
      border: none;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .compose { display: flex; gap: 6px; align-items: center; }
    .compose textarea {
      flex: 1;
      resize: none;
      min-height: 38px;
      max-height: 120px;
      padding: 8px 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-family: inherit;
      font-size: 14px;
    }
    .compose textarea:focus { outline: 2px solid ${brandColor}; outline-offset: -1px; border-color: transparent; }
    .compose .btn-primary { padding: 8px 12px; }
    .error { color: #b91c1c; font-size: 12px; margin: 4px 0 0; }
    .branding { text-align: center; font-size: 11px; color: #9ca3af; padding: 4px 0 2px; }
    .branding a { color: inherit; text-decoration: none; }
  `;
}
