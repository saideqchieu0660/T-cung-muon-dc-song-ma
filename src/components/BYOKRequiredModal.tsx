import React, { useEffect, useState } from "react";
import { Key, X, AlertCircle } from "lucide-react";

export function BYOKRequiredModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setKeyInput(localStorage.getItem("henosis_cerebras_key") || "");
    };
    window.addEventListener("require-byok-key", handleOpen);
    return () => window.removeEventListener("require-byok-key", handleOpen);
  }, []);

  if (!isOpen) return null;

  const handleSave = () => {
    if (keyInput.trim()) {
      localStorage.setItem("henosis_cerebras_key", keyInput.trim());
      setIsOpen(false);
      window.location.reload(); 
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-lg p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <Key className="w-5 h-5 text-orange-500" />
            Yêu cầu API Key
          </h2>
          <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              <p className="font-bold mb-1">API Key là gì và tại sao cần thiết?</p>
              <p className="mb-2">API Key là một "chìa khóa" mã số giúp hệ thống kết nối trực tiếp với siêu AI Cerebras để xử lý các tác vụ như: tạo thẻ học bằng AI, chat với Agent, định dạng nội dung...</p>
              <p className="font-bold mt-3 mb-1">Cách lấy API Key miễn phí (Chỉ mất 1-2 phút):</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Truy cập vào trang <a href="https://cloud.cerebras.ai" target="_blank" className="text-orange-500 hover:underline font-bold">cloud.cerebras.ai</a></li>
                <li>Đăng nhập / Đăng ký tài khoản (rất nhanh).</li>
                <li>Vào mục <b>API Keys</b> và tạo một Key mới.</li>
                <li>Copy dãy mã đó và dán vào ô bên dưới.</li>
              </ol>
            </div>
          </div>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 italic text-center">
          * Key của bạn sẽ được <b>lưu cục bộ trên trình duyệt</b>. Lần sau bạn sẽ không cần phải lấy hoặc nhập lại nữa.
        </p>

        <div className="relative mb-6">
          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Nhập Cerebras API Key (ví dụ: csk-xxx...)"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:text-zinc-100"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={() => setIsOpen(false)} className="px-4 py-2 rounded-xl text-zinc-500 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition">
            Hủy
          </button>
          <button onClick={handleSave} className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition shadow-lg shadow-orange-500/20">
            Lưu & Tiếp tục
          </button>
        </div>
      </div>
    </div>
  );
}
