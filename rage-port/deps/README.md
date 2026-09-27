# Original engine crypto dependency

`openssl-1.0.2u` is the official OpenSSL `OpenSSL_1_0_2u` source tag, built as
WebAssembly with Emscripten 3.1.74. It retains the transparent EVP contexts and
X509/BIO APIs used by Rage's original registration reader, plus the SHA1 group
hashes and MD5 calls. The engine's cryptography is not replaced with stubs.

Build and check from the project root:

```
python3 rage-port/deps/build-openssl.py
python3 rage-port/deps/test-openssl.py
```

The build script pins and verifies the downloaded archive's SHA256. It runs
Configure, refreshes old Makefile dependencies, and compiles the genuine
`libcrypto.a`. Native assembly, threads, sockets, hardware engines, dynamic
modules, shared libraries and TLS applications are excluded. Browser network
security remains provided by the browser; this library serves legacy local
file compatibility.

Use `openssl-1.0.2u/include` before the original bundled OpenSSL headers when
compiling the engine, and link `openssl-1.0.2u/libcrypto.a` after engine objects.
No special OpenSSL link flags or `libssl` are required. Emscripten's normal
filesystem support remains needed for certificate/file APIs.

The smoke test compiles to WASM and runs under Node. It checks SHA1 and MD5
known answers, X509 certificate parsing, BIO base64 decoding, and the original
EVP verification API against both a valid signature and altered data. The
certificate/key is OpenSSL's publicly shipped `apps/server.pem` test fixture.
It is used only for this test.

Source: https://github.com/openssl/openssl/tree/OpenSSL_1_0_2u
License: `openssl-1.0.2u/LICENSE`.
