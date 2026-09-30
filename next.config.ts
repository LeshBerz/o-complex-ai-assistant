import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Локальные эмбеддинги: native-модуль onnxruntime-node нельзя бандлить.
  // Оба пакета уже есть во встроенном списке Next 16, здесь указаны явно,
  // чтобы не зависеть от этого списка.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  outputFileTracingIncludes: {
    "/api/*": [
      // база знаний читается через fs
      "./data/kb/**/*",
      // трейсер не видит native-бинарники onnxruntime-node (проверено по .nft.json после next build);
      // берём только linux/x64 для Vercel, иначе +220 МБ бинарников других платформ
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**/*",
      "./node_modules/onnxruntime-node/lib/**/*",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**/*",
    ],
  },
};

export default nextConfig;
