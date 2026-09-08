# WebP WASM 构建说明

交付的 cwebp.mjs 和 cwebp.wasm 来自官方 libwebp 1.6.0 的 cwebp，编译时链接 JPEG、PNG 解码库。两者配合使用，不是两种独立实现。

选用体积优先的构建：-Oz、LTO、emmalloc，关闭 SIMD 和运行时多线程。构建并行数为 18。官方 WEBP_BUILD_WEBP_JS 目标是 WebP 解码示例，因此这里关闭该目标，构建 cwebp。

## 版本

| 组件 | 版本 |
| --- | --- |
| libwebp | v1.6.0 |
| libwebp 提交 | 4fa21912338357f89e4fd51cf2368325b59e9bd9 |
| Emscripten | Homebrew 6.0.9 (emcc 显示 6.0.9-git) |
| JPEG port | IJG 9f |
| libpng port | 1.6.58 |
| zlib port | 1.3.2 |

JPEG、libpng、zlib 使用 Emscripten ports 的 WASM 构建，不使用宿主平台的同名二进制库。首次编译会下载 port 源码并检查固定的 SHA-512。

Emscripten 6.0.9 对应的 Homebrew 配方固定了 LLVM 和 Binaryen 源码修订：

- LLVM：b158b0ae6c559f87be325b8f427c5588e6a48823
- Binaryen：d03c25ea43d8f147fc222f9b88ff3bf641abe8da

### 来源

- [libwebp v1.6.0](https://chromium.googlesource.com/webm/libwebp/+/refs/tags/v1.6.0)
- [Homebrew 配方](https://github.com/Homebrew/homebrew-core/blob/8329ee61df7d984deb40667f811bc1ea3de651bc/Formula/e/emscripten.rb)
- [JPEG port](https://github.com/emscripten-core/emscripten/blob/6.0.9/tools/ports/libjpeg.py)
- [PNG port](https://github.com/emscripten-core/emscripten/blob/6.0.9/tools/ports/libpng.py)
- [zlib port](https://github.com/emscripten-core/emscripten/blob/6.0.9/tools/ports/zlib.py)

## 构建

准备上述 Emscripten 版本、CMake 和 Make。确认 emcc、emcmake、cmake 均可执行；Emscripten 需要 Python 3.10 或更新版本。以下命令从一个可写的工作目录开始，构建目录应位于临时存储中。

```sh
git clone --depth 1 --branch v1.6.0 --single-branch \
    https://chromium.googlesource.com/webm/libwebp
cd libwebp
mkdir -p build

emcc --version

# 先生成 ports 的库和头文件，供 CMake 的依赖探测使用。
emcc -O3 -sUSE_LIBJPEG=1 -sUSE_LIBPNG=1 \
    -c imageio/jpegdec.c -I. -Isrc -DWEBP_HAVE_JPEG=1 \
    -o build/jpegdec-probe.o

emcmake cmake -S . -B build \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_FLAGS="-flto -sUSE_LIBJPEG=1 -sUSE_LIBPNG=1" \
    -DCMAKE_C_FLAGS_RELEASE="-Oz -DNDEBUG" \
    -DCMAKE_EXE_LINKER_FLAGS="-Oz -flto -sUSE_LIBJPEG=1 -sUSE_LIBPNG=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createCWebP -sINVOKE_RUN=0 -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=5MB -sEXPORTED_RUNTIME_METHODS=FS,callMain -sENVIRONMENT=web,worker,node -sMALLOC=emmalloc -sASSERTIONS=0" \
    -DWEBP_BUILD_CWEBP=ON \
    -DWEBP_BUILD_DWEBP=OFF \
    -DWEBP_BUILD_ANIM_UTILS=OFF \
    -DWEBP_BUILD_GIF2WEBP=OFF \
    -DWEBP_BUILD_IMG2WEBP=OFF \
    -DWEBP_BUILD_VWEBP=OFF \
    -DWEBP_BUILD_WEBPINFO=OFF \
    -DWEBP_BUILD_LIBWEBPMUX=OFF \
    -DWEBP_BUILD_WEBPMUX=OFF \
    -DWEBP_BUILD_EXTRAS=OFF \
    -DWEBP_BUILD_WEBP_JS=OFF \
    -DWEBP_USE_THREAD=OFF \
    -DWEBP_ENABLE_SIMD=OFF \
    -DCMAKE_DISABLE_FIND_PACKAGE_GIF=TRUE

cmake --build build --target cwebp --parallel 18

# EXPORT_ES6 已生成 ES 模块，只需调整扩展名。
cp build/cwebp.js build/cwebp.mjs
```

配置输出必须包含 Found JPEG、Found PNG 和 Found ZLIB，且指向 Emscripten 的 WASM 库。

最终保留 cwebp.mjs 和 cwebp.wasm；部署时二者放在同一目录。线上"开源许可"页面提供第三方组件清单和仓库链接，不嵌入第三方许可全文。各组件的来源与许可链接见 [第三方组件](./README.md)。

本说明整理了成功构建所用的最终参数，未再次执行整套构建。更换工具链、依赖或配置后，不保证生成相同字节。

## 当前交付文件校验

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| cwebp.mjs | 63467 | 28f6a66711deff382b926c432e7ab6be39cc3d88d08ffea37e2ffb7e80934a47 |
| cwebp.wasm | 464283 | 6900b83cab2d62fea23506d2c9731e2bd53f2fb28758d3491693efb9d8640394 |

## 使用与已知限制

- 每张图片创建独立模块实例，通过 FS 写入完整 JPG/PNG 数据，再调用 callMain，检查其返回码后读取 WebP 数据。
- 默认测试参数是 -q 80 -m 4。无损模式添加 -lossless；需要保留完全透明像素的 RGB 时再添加 -exact。
- 浏览器应通过 HTTP(S) 加载模块。大图编码同步执行，建议使用 Worker。当前产物已在 Node.js 验证，尚未完成浏览器实测。
- CMYK JPEG 尚不支持：解码阶段请求 RGB 转换时报 Unsupported color conversion request。
- 默认丢弃 EXIF 方向标记且不旋转像素。-metadata all 可以保留标记，但不保证所有读取端都会按标记显示。
- 16 位 PNG 会降为 8 位；后续无损编码不会恢复原始精度。
- WebP 单边尺寸上限是 16383；内存耗尽行为尚未测试。
