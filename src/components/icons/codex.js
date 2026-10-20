/*
 * A subset of the Codex icon set — the icons of the Wikimedia Design System.
 * https://doc.wikimedia.org/codex/latest/icons/all-icons.html
 *
 * Generated from @wikimedia/codex-icons 2.7.0. Do not hand-edit the paths;
 * English variants are used for the language-specific text-style icons.
 *
 * Vendored rather than installed because that package's "engines" field asks
 * for Node >= 24.14.1, which would print a warning on every supported install.
 * Only generic interface icons are included: the Wikimedia project logos that
 * ship in the same package are trademarks and are deliberately left out.
 *
 * Each value is SVG inner markup for a 20×20 viewBox, or { ltr, rtl } when
 * the icon has a mirrored right-to-left variant, or { ltr, flip } when it is
 * mirrored with a CSS transform in right-to-left contexts.
 *
 * The icon artwork is distributed under its original licence:
 *
 * MIT License
 *
 * Copyright (c) 2011-2022 Wikimedia Design & OOUI team and other contributors.
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

export const cdxIconAdd = "<path d=\"M11 9h7v2h-7v7H9v-7H2V9h7V2h2z\"/>";
export const cdxIconAlert = "<path d=\"M9.5 1h1L19 17.2V19H1v-1.8zM9 7v6h2V7zm0 8v2h2v-2z\"/>";
export const cdxIconAlignCenter = "<path d=\"M1 3h18v2H1zm0 12h18v2H1zm6-8h6v6H7z\"/>";
export const cdxIconAlignLeft = "<path d=\"M19 3v2H1V3zm0 4v2H9V7zm0 4v2H9v-2zm0 4v2H1v-2zM1 7h6v6H1z\"/>";
export const cdxIconAlignRight = "<path d=\"M1 3h18v2H1zm0 4h10v2H1zm0 4h10v2H1zm0 4h18v2H1zm12-8h6v6h-6z\"/>";
export const cdxIconArrowDown = "<path d=\"M11 1v13.876l4-4 1.414 1.414-5.707 5.707H9.293L3.586 12.29 5 10.876l4 4V1z\"/>";
export const cdxIconArrowNext = {"ltr":"<path d=\"M18 9.804v1.392l-5.688 5.883-1.436-1.39L14.93 11.5H1v-2h13.923l-4.047-4.165 1.434-1.394z\"/>","flip":true};
export const cdxIconArrowPrevious = {"ltr":"<path d=\"M8.124 5.335 4.077 9.5H18v2H4.07l4.054 4.188-1.437 1.391L1 11.196V9.804L6.69 3.94l1.434 1.394Z\"/>","flip":true};
export const cdxIconArrowUp = "<path d=\"M16.414 7.71 15 9.124l-4-4V19H9V5.124l-4 4L3.586 7.71l5.707-5.707h1.414z\"/>";
export const cdxIconBlock = "<path d=\"M10 1a9 9 0 110 18 9 9 0 010-18M5 9v2h10V9z\"/>";
export const cdxIconBold = "<path d=\"M11.257 1.007A5 5 0 0116 6l-.007.257a4.97 4.97 0 01-1.119 2.9A5.49 5.49 0 0117 13.5l-.007.283a5.5 5.5 0 01-5.21 5.21L11.5 19H3V1h8zM6 16h5.5a2.5 2.5 0 000-5H6zm0-8h5a2 2 0 100-4H6z\"/>";
export const cdxIconCalendar = "<path d=\"M10 14H7v-3h3z\"/><path d=\"M7 3h6V1h2v2h5v15H0V3h5V1h2zM2 16h16V8H2z\"/>";
export const cdxIconCamera = "<path d=\"M4 4h2V2h8v2h6v14H0V4h2V2h2zm4 2H2v10h16V6h-6V4H8z\"/><circle cx=\"10\" cy=\"11\" r=\"3\"/>";
export const cdxIconCancel = "<path d=\"M10 1a9 9 0 110 18 9 9 0 010-18M4.394 5.806A6.97 6.97 0 003 10a7 7 0 0011.193 5.605l-9.8-9.8ZM10 3a6.97 6.97 0 00-4.191 1.392l9.797 9.798A7 7 0 0010 3\"/>";
export const cdxIconChart = "<path d=\"M3 17h16v2H1V1h2z\"/><path d=\"M19 5v10H5v-1l4.5-5.5 3 3.5L18 5z\"/>";
export const cdxIconCheck = "<path d=\"M18.154 3.837 8 16.8H6.65l-4.8-3.6 1.2-1.6 4.02 3.015 9.517-12.02z\"/>";
export const cdxIconClear = "<path d=\"M14.243 7.172 11.413 10l2.828 2.83-1.414 1.413L10 11.415l-2.827 2.827-1.414-1.414L8.585 10 5.757 7.172l1.415-1.414 2.827 2.828 2.83-2.828z\"/><path d=\"M10 1a9 9 0 110 18 9 9 0 010-18m0 2a7 7 0 100 14 7 7 0 000-14\"/>";
export const cdxIconClock = "<path d=\"M10 1a9 9 0 110 18 9 9 0 010-18m0 2a7 7 0 100 14 7 7 0 000-14m1 7h3v2H9V5h2z\"/>";
export const cdxIconClose = "<path d=\"M16.707 4.707 11.414 10l5.293 5.293-1.414 1.414L10 11.414l-5.293 5.293-1.414-1.414L8.586 10 3.293 4.707l1.414-1.414L10 8.586l5.293-5.293z\"/>";
export const cdxIconCollapse = "<path d=\"m10 8.1-5.3 5.3L3.3 12l6-6h1.4l6 6-1.4 1.4z\"/>";
export const cdxIconCopy = {"ltr":"<path d=\"M13 19H1V7h6V1h12v12h-6zm-6-6V9H3v8h8v-4zm2-2h8V3H9z\"/>","flip":true};
export const cdxIconDownload = "<path d=\"M19 19H1v-2h18zm-8-7.104 3.5-3.5 1.414 1.414-5.207 5.208H9.293L4.086 9.81 5.5 8.396l3.5 3.5V1h2z\"/>";
export const cdxIconDownTriangle = "<path d=\"M5 8h10v1l-5 5-5-5z\"/>";
export const cdxIconDraggable = "<path d=\"M2 7h16v2H2zm0 4h16v2H2zM10 .5l3 3V4H7v-.5zm0 19 3-3V16H7v.5z\"/>";
export const cdxIconEdit = "<path d=\"m15.4.4 4.2 4.2-3.2 3.2-4.2-4.2zM10.8 5 15 9.2l-8.6 8.6-4.5 1.5-1.2-1.2 1.5-4.5z\"/>";
export const cdxIconEllipsis = "<path d=\"M4 11.5H1v-3h3zm7.5 0h-3v-3h3zm7.5 0h-3v-3h3z\"/>";
export const cdxIconError = "<path d=\"M19 6.4v7.199L13.6 19H6.4L1 13.599v-7.2L6.4 1h7.2zM9 14v2h2v-2zm0-9v7h2V5z\"/>";
export const cdxIconExpand = "<path d=\"m16.7 8-6 6H9.3l-6-6 1.4-1.4 5.3 5.3 5.3-5.3z\"/>";
export const cdxIconEye = "<path d=\"M5.05 5.036a7 7 0 019.9 0l4.257 4.257v1.415l-4.258 4.256a7 7 0 01-9.9 0L.794 10.708V9.293zm8.485 1.414a5 5 0 00-7.07 0L2.915 10l3.55 3.55a5 5 0 007.07 0l3.55-3.55z\"/><circle cx=\"10\" cy=\"10\" r=\"2.5\"/>";
export const cdxIconEyeClosed = "<path d=\"m19.254 17.84-1.414 1.414-3.64-3.64a7 7 0 01-9.15-.65L.793 10.707V9.292l3.542-3.543L.871 2.285 2.285.871zM2.914 9.999l3.55 3.55a5 5 0 006.302.63l-1.855-1.854a2.5 2.5 0 01-3.238-3.238L5.749 7.163zm4.724-6.604a7 7 0 017.311 1.64l4.258 4.257v1.415l-2.13 2.128-1.414-1.414 1.423-1.422-3.55-3.55A5 5 0 009.28 5.037z\"/>";
export const cdxIconFlag = {"ltr":"<path d=\"M5 2h12v10H5v8H3V0h2zm0 8h10V4H5z\"/>","flip":true};
export const cdxIconFullscreen = "<path d=\"M3 17h5v2H1v-7h2zm16 2h-7v-2h5v-5h2zM8 3H3v5H1V1h7zm11 5h-2V3h-5V1h7z\"/>";
export const cdxIconGlobe = "<path d=\"M10 1a9 9 0 110 18 9 9 0 010-18M8.028 11c.1 1.846.473 3.431.97 4.552.295.661.594 1.073.824 1.292.081.077.14.117.178.138a1 1 0 00.178-.138c.23-.22.529-.63.823-1.292.498-1.12.87-2.706.97-4.552zm-4.956 0a7 7 0 004.122 5.413C6.557 15.001 6.13 13.11 6.025 11zm10.903 0c-.104 2.11-.533 4-1.17 5.413A7 7 0 0016.928 11zm-6.78-7.414A7 7 0 003.071 9h2.953c.104-2.11.531-4.001 1.17-5.414ZM10 3.016a1 1 0 00-.178.14c-.23.22-.53.63-.823 1.292-.498 1.12-.87 2.706-.97 4.552h3.943c-.101-1.846-.473-3.431-.971-4.552-.294-.661-.593-1.073-.823-1.292a1 1 0 00-.178-.14m2.805.57c.638 1.413 1.066 3.303 1.17 5.414h2.953a7 7 0 00-4.123-5.414\"/>";
export const cdxIconHeart = "<path d=\"M11.039 3.656c2.158-2.332 5.937-2.179 7.893.318a4.99 4.99 0 01-.272 6.487L10.757 19H9.243L1.34 10.461a4.99 4.99 0 01-.272-6.487c1.956-2.497 5.735-2.65 7.893-.318L10 4.776z\"/>";
export const cdxIconHelp = {"ltr":"<path d=\"M11 18H9v-2h2zM10 2c1.497 0 2.76.433 3.66 1.268.905.84 1.34 1.994 1.34 3.232 0 1.182-.443 2.007-1.094 2.638a6.7 6.7 0 01-.95.742c-.363.241-.587.373-.923.602C11.351 10.948 11 11.86 11 13v1H9v-1c0-1.455.443-3.17 1.905-4.169.3-.204.71-.461.94-.615.281-.187.498-.349.67-.515.297-.287.485-.607.485-1.201 0-.762-.258-1.357-.7-1.768C11.853 4.317 11.117 4 10 4 7.98 4 7 5.636 7 6.5v1H5v-1C5 4.614 6.794 2 10 2\"/>","flip":true};
export const cdxIconHistory = "<path d=\"M10 1a9 9 0 110 18v-2a7 7 0 10-4-1.257V13h2.001L8 18l-1 1H2v-2l2.346-.001A8.97 8.97 0 011 10a9 9 0 019-9\"/><path d=\"M11 10h3v2H9V5h2z\"/>";
export const cdxIconHome = "<path d=\"m19.707 10.293-1.414 1.414L17 10.414V20H3v-9.586l-1.293 1.293-1.414-1.414L10 .586zM5 8.414V18h3v-5h4v5h3V8.414l-5-5z\"/>";
export const cdxIconImage = "<path d=\"M15 15H5l3.5-4 2 2L15 8z\"/><path d=\"M19 19H1V1h18zM3 17h14V3H3z\"/><circle cx=\"6.5\" cy=\"6.5\" r=\"1.5\"/>";
export const cdxIconImageAdd = {"ltr":"<path d=\"M9 3H3v14h14v-6h2v8H1V1h8z\"/><path d=\"M15 12.5V15H5l3.5-4 2 2 2.5-2.5zM16 4h3v2h-3v3h-2V6h-3V4h3V1h2z\"/><circle cx=\"6.5\" cy=\"6.5\" r=\"1.5\"/>","rtl":"<path d=\"M19 19H1v-8h2v6h14V3h-6V1h8z\"/><path d=\"M15 12.5V15H5l3.5-4 2 2 2.5-2.5zM6 1v3h3v2H6v3H4V6H1V4h3V1z\"/>"};
export const cdxIconImageGallery = {"ltr":"<path d=\"M12 16H4l3-3 1 1 4-4z\"/><path d=\"M16 20H0V4h16zM2 18h12V6H2z\"/><path d=\"M20 16h-2V2H6V0h14z\"/><circle cx=\"5.5\" cy=\"9.5\" r=\"1.5\"/>","rtl":"<path d=\"M16 16H8l3-3 1 1 4-4z\"/><path d=\"M20 20H4V4h16zM6 18h12V6H6z\"/><path d=\"M14 0v2H2v14H0V0z\"/><circle cx=\"9.5\" cy=\"9.5\" r=\"1.5\"/>"};
export const cdxIconImageLayoutFrame = "<path d=\"M15 15H5V5h10zm-8-2 2-2 1.5 1.5L13 10V7H7z\"/><path d=\"M19 19H1V1h18zM3 17h14V3H3z\"/>";
export const cdxIconInfo = "<path d=\"M11 13h1v2H8v-2h1v-2H8V9h3zm0-6H9V5h2z\"/><path d=\"M10 1a9 9 0 110 18 9 9 0 010-18m0 2a7 7 0 100 14 7 7 0 000-14\"/>";
export const cdxIconInfoFilled = "<path d=\"M10 1a9 9 0 110 18 9 9 0 010-18M8 9v2h1v2H8v2h4v-2h-1V9zm1-4v2h2V5z\"/>";
export const cdxIconItalic = "<path d=\"M14 4h-2.063l-1.778 12H12v2H6v-2h2.137L9.915 4H8V2h6z\"/>";
export const cdxIconKey = "<path d=\"M13.706 1.5C17.128 1.5 20 4.133 20 7.5s-2.872 6-6.294 6c-.65 0-1.28-.095-1.873-.27q-.007-.004-.016-.006L9.855 15H9v2H7v1.5H1l-1-1v-2.435L7.446 8.13a6 6 0 01-.034-.631c0-3.367 2.872-6 6.294-6Zm0 2c-2.426 0-4.294 1.844-4.294 4q0 .407.083.79l.12.555L2 15.935v.565h3V15h2v-2h2.086l2.3-2.081.584.24a4.5 4.5 0 001.736.341c2.426 0 4.294-1.844 4.294-4s-1.868-4-4.294-4\"/><circle cx=\"13.75\" cy=\"7.5\" r=\"1.5\"/>";
export const cdxIconKeyboard = "<path d=\"M6 14H4v-2h2zm7 0H7v-2h6zm3 0h-2v-2h2zM5 11H3V9h2zm3 0H6V9h2zm3 0H9V9h2zm3 0h-2V9h2zm3 0h-2V9h2zM5 8H3V6h2zm3 0H6V6h2zm3 0H9V6h2zm3 0h-2V6h2zm3 0h-2V6h2z\"/><path d=\"M20 17H0V3h20zM2 15h16V5H2z\"/>";
export const cdxIconLanguage = "<path d=\"m17.835 19-1.248-3h-4.174l-1.248 3.001H9l4.577-11.005h1.846L20 19zm-4.59-5h2.51L14.5 10.982zM7.618 3H12v2H9.991a8.5 8.5 0 01-1.423 4.02q-.24.358-.528.707.634.367 1.379.711l.908.42-.839 1.816-.907-.42a18 18 0 01-2.026-1.09c-1.255.979-2.912 1.8-5.076 2.31l-.973.228-.458-1.946.973-.23c1.631-.383 2.885-.954 3.85-1.608C3.29 8.527 2.317 6.884 2.065 5H0V3h5.382l-.724-1.447 1.79-.895L7.617 3ZM4.094 5c.243 1.282.974 2.489 2.29 3.586A6.54 6.54 0 007.98 5z\"/>";
export const cdxIconLayout = {"ltr":"<path d=\"M9 18H2V2h7zm-5-2h3V4H4zm14 2h-7v-7h7zm-5-2h3v-3h-3zm5-7h-7V2h7zm-5-2h3V4h-3z\"/>","flip":true};
export const cdxIconLightbulb = "<path d=\"M13 20H7v-2h6zM10 0c1.938 0 3.58.556 4.745 1.644C15.918 2.738 16.5 4.27 16.5 6c0 2.22-1.15 3.732-2.04 4.727-.644.72-.96 1.633-.96 2.662V16h-7v-2.611c0-1.029-.317-1.942-.96-2.662C4.65 9.732 3.5 8.22 3.5 6c0-1.627.593-3.145 1.743-4.255C6.395.634 8.032 0 10 0\"/>";
export const cdxIconLink = "<path d=\"M5.862 7.453a4.353 4.353 0 016.167-.01l.707.706-1.414 1.414-.707-.707a2.355 2.355 0 00-3.335.005L4.354 11.81a2.725 2.725 0 003.842 3.868l.046-.046.715-.7 1.4 1.43-.715.698-.046.046A4.727 4.727 0 012.934 10.4z\"/><path d=\"M10.405 2.894a4.726 4.726 0 016.662 6.707l-2.928 2.947a4.354 4.354 0 01-6.167.01l-.707-.707 1.414-1.415.707.707c.921.921 2.416.92 3.334-.004l2.928-2.948a2.727 2.727 0 00-3.843-3.868l-.761.746-1.4-1.428.713-.7z\"/>";
export const cdxIconLinkExternal = {"ltr":"<path d=\"M8 7H3v10h10v-5h2v7H1V5h7z\"/><path d=\"M19.001 2 19 8h-2V4.415l-9 9L6.586 12l9-8.999L12 3V1h6.001z\"/>","flip":true};
export const cdxIconLock = "<path d=\"M11 15H9v-3h2z\"/><path d=\"M10 1a4 4 0 014 4v3h3v11H3V8h3V5a4 4 0 014-4M5 17h10v-7H5zm5-14a2 2 0 00-2 2v3h4V5a2 2 0 00-2-2\"/>";
export const cdxIconLogIn = {"ltr":"<path d=\"M19 19H5v-2h12V3H5V1h14z\"/><path d=\"M14.018 9.293v1.414L9.31 15.414 7.896 14l3-3H1V9h9.896l-3-3L9.31 4.586z\"/>","flip":true};
export const cdxIconLogOut = {"ltr":"<path d=\"M13 3H3v14h10v2H1V1h12z\"/><path d=\"M19 9.293v1.414l-4.69 4.707L12.895 14l3-3H6V9h9.896l-3-3 1.414-1.414z\"/>","flip":true};
export const cdxIconMagicWand = "<path d=\"m11.813 9.778-9.899 9.9L.5 18.264l9.9-9.9zm4.077-6.906 1.58-1.579 1.415 1.414-1.58 1.58 2.086.522-.486 1.94-2.181-.546.546 2.182-1.94.485-.523-2.086-1.579 1.58-1.415-1.414 1.58-1.58-2.085-.521.485-1.94 2.182.545-.545-2.182 1.94-.485z\"/>";
export const cdxIconMapPin = "<path d=\"M9.15 19.07h1.7l5.5-8a7.16 7.2 0 10-12.7 0zM10 16.8l-4.1-6a5.16 5.14 0 118.2 0z\"/><circle cx=\"10\" cy=\"8\" r=\"2\"/>";
export const cdxIconMenu = "<path d=\"M1 3h18v2H1zm0 6h18v2H1zm0 6h18v2H1z\"/>";
export const cdxIconMove = "<path d=\"M13 3.5V4h-2v5h5V7h.5l3 3-3 3H16v-2h-5v5h2v.5l-3 3-3-3V16h2v-5H4v2h-.5l-3-3 3-3H4v2h5V4H7v-.5l3-3z\"/>";
export const cdxIconMoveFirst = {"ltr":"<path d=\"M6 17H4V3h2zM16.417 4.707 11.124 10l5.293 5.293-1.414 1.414-6-6V9.293l6-6z\"/>","flip":true};
export const cdxIconMoveLast = {"ltr":"<path d=\"M16 17h-2V3h2zm-5-7.707v1.414l-5.993 6-1.414-1.414L8.886 10 3.593 4.707l1.414-1.414z\"/>","flip":true};
export const cdxIconNext = {"ltr":"<path d=\"M14 9.293v1.414l-5.982 6-1.415-1.414L11.896 10 6.603 4.707l1.414-1.414z\"/>","flip":true};
export const cdxIconNotice = "<path d=\"M11 15H9v-2h2zm0-4H9V5h2z\"/><path d=\"M10 1a9 9 0 110 18 9 9 0 010-18m0 2a7 7 0 100 14 7 7 0 000-14\"/>";
export const cdxIconPalette = {"ltr":"<path d=\"M1.456 7.172a9 9 0 0117.259 5.079l-.968.75L11.75 13a.75.75 0 00-.75.75v4.21l-1.06 1c-.648-.04-1.938-.142-2.768-.416A9 9 0 011.456 7.172M12.2 3.354a7 7 0 00-4.4 13.291c.3.1.745.17 1.2.224v-3.12A2.75 2.75 0 0111.75 11h5.178A7 7 0 0012.2 3.355Z\"/><circle cx=\"6.5\" cy=\"10.5\" r=\"1.5\"/><circle cx=\"9.5\" cy=\"6.5\" r=\"1.5\"/><circle cx=\"13.5\" cy=\"8.5\" r=\"1.5\"/>","flip":true};
export const cdxIconPaste = {"ltr":"<path d=\"M11 3H9v8h8V9h2v4h-6v6H1V7h6V1h4zM3 17h8v-4H7V9H3z\"/><path d=\"M16.5 3.5H19v2h-2.5V8h-2V5.5H12v-2h2.5V1h2z\"/>","flip":true};
export const cdxIconPause = "<path d=\"M8 15H5V5h3zm7 0h-3V5h3z\"/>";
export const cdxIconPlay = "<path d=\"M16 9.5v1L6.5 16H5V4h1.5z\"/>";
export const cdxIconPrevious = {"ltr":"<path d=\"M13.417 4.707 8.124 10l5.293 5.293-1.414 1.414-6-6V9.293l6-6z\"/>","flip":true};
export const cdxIconPrinter = "<path d=\"M17 5a2 2 0 012 2v9h-3v4H4v-4H1V7a2 2 0 012-2zM6 18h8V9H6zM16 7a1 1 0 100 2 1 1 0 000-2m-1-4H5V0h10z\"/>";
export const cdxIconQrCode = "<path d=\"M1 1h8v8H1zm2 2v4h4V3zm8-2h8v8h-8zm2 2v4h4V3zM1 11h8v8H1zm2 2v4h4v-4zm8-2h2v2h2v-2h4v2h-2v2h2v4h-4v-2h2v-2h-2v2h-4v2h2v-4h-2z\"/>";
export const cdxIconRedo = {"ltr":"<path d=\"M17 7.293v1.414l-4.69 4.707L10.895 12l3-3H9a4 4 0 00-4 4v5H3v-5a6 6 0 016-6h4.896l-3-3 1.414-1.414z\"/>","flip":true};
export const cdxIconReload = "<path d=\"M10 1a8.98 8.98 0 016.999 3.343L17 2h2v5l-1 1h-5l-.001-2h2.746a7 7 0 101.184 5h2.016A9 9 0 1110 1\"/>";
export const cdxIconRestore = "<path d=\"m19.254 17.84-1.414 1.414-1.84-1.84V20H4V6H2V4h.586L.87 2.285 2.285.871zM6 18h8v-2.586l-8-8zm4-18a3 3 0 013 3v1h5v2h-2v5.758l-2-2V6h-3.758L7.01 2.768A3 3 0 0110 0m0 2a1 1 0 00-1 1v1h2V3a1 1 0 00-1-1\"/>";
export const cdxIconRotate = "<path d=\"M18.263 12A8.5 8.5 0 0110 18.5a8.49 8.49 0 01-7-3.68V17H1v-5l1-1h5v2H4.232a6.504 6.504 0 0011.954-1zM10 1.5a8.49 8.49 0 017 3.679V3h2v5l-1 1h-5V7h2.767A6.5 6.5 0 0010 3.5 6.505 6.505 0 003.813 8H1.736c.9-3.73 4.258-6.5 8.264-6.5\"/>";
export const cdxIconSearch = "<path d=\"M8 1a7 7 0 015.605 11.191l5.102 5.102-1.414 1.414-5.102-5.102A7 7 0 118 1m0 2a5 5 0 100 10A5 5 0 008 3\"/>";
export const cdxIconSettings = "<path d=\"M11.835 3.505a6.7 6.7 0 011.46.603l2.362-1.18 1.414 1.415-1.18 2.361a6.7 6.7 0 01.603 1.46L19 9v2l-2.506.835a6.7 6.7 0 01-.603 1.46l1.18 2.362-1.414 1.414-2.362-1.18a6.7 6.7 0 01-1.46.603L11 19H9l-.836-2.506a6.7 6.7 0 01-1.46-.603l-2.361 1.18-1.414-1.414 1.18-2.362a6.7 6.7 0 01-.604-1.46L1 11V9l2.505-.836a6.7 6.7 0 01.603-1.46l-1.18-2.361 1.415-1.414 2.361 1.18a6.7 6.7 0 011.46-.604L9 1h2zM10 7a3 3 0 100 6 3 3 0 000-6\"/>";
export const cdxIconShare = "<path d=\"M19.053 7.33v1.34L13.347 15H11v-3.862c-1.453.393-2.914 1.593-4.307 3.182-1.456 1.662-2.58 3.424-3.46 4.68H1c0-1.489.535-4.898 2.115-7.965C4.583 8.185 7.063 5.451 11 5.052V1h2.347zM13 7h-1c-3.467 0-5.694 2.207-7.107 4.951C4.41 12.885 3.782 14.077 3.5 15c.449-.598 1.187-1.425 1.688-1.998C6.93 11.015 9.271 9 12 9h1v3.396L16.963 8 13 3.604z\"/>";
export const cdxIconSpeechBubbles = {"ltr":"<path d=\"M15 6h4v14h-2.602l-3.75-3H5v-4.12L3.601 14H1V0h14zm0 5H7.352L7 11.281V15h6.35l.275.219L17 17.918V8h-2zm-12 .918 3.375-2.7L6.649 9H13V2H3z\"/>","flip":true};
export const cdxIconStar = "<path d=\"M12.9 7H19v1.588l-4.593 3.589L16.5 19h-2L10 15.5 5.5 19h-2l2.092-6.823L1 8.587V7h6.1l1.945-5.995h1.91zM8.6 9H4.5l3.415 2.435-1.289 4.17L10 13l3.373 2.605-1.288-4.17L15.5 9h-4.05L10 4.687z\"/>";
export const cdxIconSticker = "<path d=\"M19 10.414 10.414 19H1V1h18zM3 17h6.5V9.5H17V3H3z\"/>";
export const cdxIconSuccess = "<path d=\"M10 1a9 9 0 110 18 9 9 0 010-18M8.823 11.118 6.8 9.6l-1.2 1.6 2.8 2.1h1.1l4.905-5.956-1.561-1.25z\"/>";
export const cdxIconTag = {"ltr":"<path d=\"m19.914 11.503-8.413 8.414L.004 8.414.003 1l1-1h7.415zM2.003 7.587l9.497 9.502 5.585-5.587-9.496-9.501L2.003 2z\"/><circle cx=\"5.5\" cy=\"5.5\" r=\"1.5\"/>","flip":true};
export const cdxIconTextStyle = "<path d=\"M17 19H3v-2h14zM16 2v13h-2v-3.5H9.124L6.499 15H4l9.75-13zm-5.376 7.5H14V4.999z\"/>";
export const cdxIconTrash = "<path d=\"M10 0a3 3 0 013 3v1h5v2h-2v14H4V6H2V4h5V3a3 3 0 013-3M6 18h8V6H6zm4-16a1 1 0 00-1 1v1h2V3a1 1 0 00-1-1\"/>";
export const cdxIconUnderline = "<path d=\"M17 19H3v-2h14zM7 10a3 3 0 106 0V1h2v9a5 5 0 01-10 0V1h2z\"/>";
export const cdxIconUndo = {"ltr":"<path d=\"m9.124 4-3 3H11a6 6 0 016 6v5h-2v-5a4 4 0 00-4-4H6.124l3 3-1.414 1.414-4.707-4.707V7.293L7.71 2.586z\"/>","flip":true};
export const cdxIconUniversalDesign = "<path d=\"M18 9h-5v10h-2v-5H9v5H7V9H2V7h16z\"/><circle cx=\"10\" cy=\"3\" r=\"2\"/>";
export const cdxIconUnLock = "<path d=\"M11 15H9v-3h2z\"/><path d=\"M10 1a4 4 0 014 4v3h3v11H3V8h9V5a2 2 0 10-4 0v.5H6V5a4 4 0 014-4M5 17h10v-7H5z\"/>";
export const cdxIconUpload = "<path d=\"M19 19H1v-2h18zM10.703 1l5.211 5.117-1.406 1.422L11 4v11H9V4L5.492 7.54 4.086 6.116 9.296 1z\"/>";
export const cdxIconUserAvatar = "<path d=\"M12 11a6 6 0 016 6v2H2v-2a6 6 0 016-6z\"/><circle cx=\"10\" cy=\"5\" r=\"4\"/>";
export const cdxIconUserGroup = {"ltr":"<path d=\"M7 10c.91 0 1.764.244 2.5.67A5 5 0 0112 10h3a5 5 0 015 5v2H0v-2a5 5 0 015-5zm5 2q-.473.002-.901.138c.567.81.901 1.797.901 2.862h6a3 3 0 00-3-3zm1.5-9a3 3 0 110 6 3 3 0 010-6m0 2a1 1 0 100 2 1 1 0 000-2\"/><circle cx=\"6\" cy=\"6\" r=\"3\"/>","flip":true};
export const cdxIconZoomIn = "<path d=\"M9 7h2v2H9v2H7V9H5V7h2V5h2z\"/><path d=\"M8 1a7 7 0 015.605 11.191l5.102 5.102-1.414 1.414-5.102-5.102A7 7 0 118 1m0 2a5 5 0 100 10A5 5 0 008 3\"/>";
export const cdxIconZoomOut = "<path d=\"M11 9H5V7h6z\"/><path d=\"M8 1a7 7 0 015.605 11.191l5.102 5.102-1.414 1.414-5.102-5.102A7 7 0 118 1m0 2a5 5 0 100 10A5 5 0 008 3\"/>";
