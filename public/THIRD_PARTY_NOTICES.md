# Third-party notices

The editable components in `src/components/ui` were generated from shadcn/ui and
adapted to use the local class utility and Radix Slot package.
Source: https://github.com/shadcn-ui/ui

## shadcn/ui — MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## PDF and UI runtime libraries

PDF.js is Apache-2.0; its license and font/decoder notices are distributed alongside
`pdf-assets`. Liberation fonts retain their SIL Open Font License notice; Foxit
font data retains its bundled license. pdf-lib, React and React DOM use MIT;
Lucide icons use ISC. Their complete license texts are copied to `licenses/`
by `scripts/pdf-assets.mjs` during installation. Tailwind and base UI utilities
retain their package license notices. No font license is inferred from the
presence of a font in an imported PDF: embedded outline reuse is not implemented.
