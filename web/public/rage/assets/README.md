# Original Clonk Rage interface assets

All files listed in `manifest.json` are copied byte-for-byte from the official Clonk Rage 4.9.10.7 [330] release. SHA-256 values and source paths are recorded there. No image generation, repainting, recoloring, or raster editing was used.

Original content: RedWolf Design / Matthes Bender, CC BY-NC 4.0 (<https://creativecommons.org/licenses/by-nc/4.0/>). “Clonk” is a registered trademark of Matthes Bender. The startup menu includes the required credit/license links.

- StartupMainMenuBG.png: original 800×600 mine-cart menu artwork; responsive `cover` cropping preserves aspect ratio.
- Logo.png: original 320×103 Clonk Rage logo.
- StartupBigButton.png / StartupBigButtonDown.png: original 224×40 menu button sprites.
- GUIButton.png / GUIButtonDown.png: original 128×32 small buttons, including the browser Save control.
- StartupDlgPaper.png: original paper panel used for controls help.
- Endeavour.ttf: the original menu/interface font from System.c4g.
- UpperBoard.png and GUICaption.png are retained as original interface references.

The game header remains rendered by the C++ engine. HTML adds only a Save button and a zoom slider inside its 64px browser header. A transparent hit area over the original engine-rendered logo opens the menu; it does not draw a duplicate logo or wooden bar. The original image bytes stay unchanged; CSS scales interface sprites for the responsive browser layout.

Desktop, portrait, and landscape startup layouts were checked with actual browser screenshots at 1280×900, 390×844, 844×390, and 568×320. Their menu bounds fit each viewport without horizontal overflow or initial-menu scrolling.

## Higher-resolution menu background

`StartupMainMenuBG-HD.webp` is an ImageGen-assisted restoration of the original
800×600 `StartupMainMenuBG.png`, retaining its mine-cart composition and warm
lighting. It is a modified derivative, unlike the byte-identical original UI
assets above. Original artwork © RedWolf Design / Matthes Bender; CC BY-NC 4.0.
The generated source is retained in `web/artwork/StartupMainMenuBG-HD.png`.
