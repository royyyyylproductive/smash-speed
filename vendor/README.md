Pre-downloaded, ready to copy into the smash-speed repo (no CDN at runtime).

- tfjs/tf.min.js — @tensorflow/tfjs 4.22.0
- tfjs/tf-backend-wasm.min.js and tfjs-backend-wasm.wasm — optional WASM backend (prefer WebGL on phone, WASM fallback)
- tfjs/pose-detection.min.js — @tensorflow-models/pose-detection 2.1.3 (optional wrapper)
- movenet-multipose-lightning/ — TF.js graph model (model.json + group1-shard{1,2,3}of3.bin)
  Source: https://tfhub.dev/google/tfjs-model/movenet/multipose/lightning/1?tfjs-format=file
  Load with: tf.loadGraphModel('./vendor/movenet-multipose-lightning/model.json')
  Or pose-detection with a local model path / custom modelUrl.

Do not fetch these from the network in the PWA.
