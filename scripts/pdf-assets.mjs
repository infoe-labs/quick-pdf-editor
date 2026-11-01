import { cp, mkdir,rm } from 'node:fs/promises';
await rm('public/pdf-assets',{recursive:true,force:true});
await mkdir('public/pdf-assets',{recursive:true});
for(const name of ['cmaps','standard_fonts','wasm'])await cp(`node_modules/pdfjs-dist/${name}`,`public/pdf-assets/${name}`,{recursive:true});
await cp('node_modules/pdfjs-dist/LICENSE','public/pdf-assets/LICENSE');
await mkdir('public/licenses',{recursive:true});
for(const [pkg,file] of [['pdf-lib','LICENSE.md'],['react','LICENSE'],['react-dom','LICENSE'],['lucide-react','LICENSE']])await cp(`node_modules/${pkg}/${file}`,`public/licenses/${pkg}.txt`);
