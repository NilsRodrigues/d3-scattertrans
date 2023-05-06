import path from 'path';
import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import rust from '@wasm-tool/rollup-plugin-rust';
import workerLoader from 'rollup-plugin-web-worker-loader';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import { terser } from 'rollup-plugin-terser';

const externals = {
    d3: 'd3',
    'd3-selection': 'd3',
    'd3-ease': 'd3'
};

const isRelease = process.env.NODE_ENV === 'production';

export default {
    input: 'src/index.ts',
    plugins: [
        nodePolyfills(),
        workerLoader({ extensions: ['.js', '.ts'] }),
        nodeResolve({ browser: true }),
        commonjs(),
        typescript(),
        rust({
            debug: false,
            inlineWasm: true,
        }),
        isRelease ? terser() : null
    ].filter(plugin => !!plugin),
    external: Object.keys(externals),
    output: {
        dir: path.join(__dirname, 'dist'),
        name: 'd3',
        extend: true,
        format: 'umd',
        globals: externals
    }
};
