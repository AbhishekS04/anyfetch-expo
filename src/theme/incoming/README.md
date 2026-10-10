# 🎨 Incoming Shader Drop Zone

Use this folder to drop or paste your exported shaders from **FeralUI** (or any custom shader tool).

---

## 📁 How to Add a New Shader

Whenever you download or copy a shader, you can do either of the following:

### Method 1: Create a Subfolder per Theme (Recommended)
Create a new folder inside `src/theme/incoming/` with your theme name, for example:
```
src/theme/incoming/Neon Dusk/
├── theme.json         # (The exported JSON file)
├── React.tsx          # (The React code component)
└── style.css          # (The CSS styles)
```

### Method 2: Single File Paste
Create a file directly inside `src/theme/incoming/` named `<ThemeName>.json` (or `<ThemeName>.txt`) and paste the JSON or React code into it:
```
src/theme/incoming/Crimson Dawn.json
```

---

## 🚀 What to do next:
Once you drop or paste your files here, just tell me:
> *"I added [Theme Name] in the incoming folder, add it to the theme dial"*

I will immediately:
1. Parse the color stops, OKLCH/RGB tones, speed, and turbulence.
2. Convert and validate the WebGL uniforms for mobile OpenGL ES.
3. Add the theme to the live **Wheel Carousel dialer** with smooth real-time shade morphing!
