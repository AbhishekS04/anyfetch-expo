#!/usr/bin/env python3
import os
import math
from PIL import Image, ImageDraw

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES_DIR = os.path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res')
ASSETS_DIR = os.path.join(ROOT_DIR, 'assets')
LOGO_DIR = os.path.join(ROOT_DIR, 'logo')

DENSITIES = {
    'mdpi':    {'fg': 108, 'icon': 48,  'splash': 160},
    'hdpi':    {'fg': 162, 'icon': 72,  'splash': 240},
    'xhdpi':   {'fg': 216, 'icon': 96,  'splash': 320},
    'xxhdpi':  {'fg': 324, 'icon': 144, 'splash': 480},
    'xxxhdpi': {'fg': 432, 'icon': 192, 'splash': 640},
}

def create_circular_mask(size):
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask

def make_transparent_by_floodfill(im_path, tolerance=35):
    im = Image.open(im_path).convert('RGBA')
    w, h = im.size
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(im, corner, (0, 0, 0, 0), thresh=tolerance)
    return im

def crop_transparent(im):
    bbox = im.getbbox()
    return im.crop(bbox)

def make_foreground(crop_img, target_size, max_dimension_ratio=0.52):
    """
    Centers the cropped image onto target_size x target_size transparent canvas.
    Android safe zone is 66dp of 108dp (61.1%).
    Using max_dimension_ratio <= 0.53 ensures 100% strict safe zone compliance.
    """
    canvas = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))
    desired_max = int(target_size * max_dimension_ratio)
    w, h = crop_img.size
    scale = desired_max / max(w, h)
    new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
    resized = crop_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    pos = ((target_size - new_w) // 2, (target_size - new_h) // 2)
    canvas.paste(resized, pos, resized)
    return canvas

def make_feathered_foreground(im_path, target_size, max_dimension_ratio=0.58):
    """
    For full-artwork logos like angry & dramatic, feathers the outer edges
    so they blend seamlessly into the background color layer.
    """
    im = Image.open(im_path).convert('RGBA')
    w, h = im.size
    desired_max = int(target_size * max_dimension_ratio)
    scale = desired_max / max(w, h)
    new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
    resized = im.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    mask = Image.new('L', (new_w, new_h), 255)
    mcx, mcy = new_w / 2, new_h / 2
    r_inner = min(mcx, mcy) * 0.70
    r_outer = min(mcx, mcy) * 0.98
    for y in range(new_h):
        for x in range(new_w):
            d = math.hypot(x - mcx, y - mcy)
            if d > r_outer:
                mask.putpixel((x, y), 0)
            elif d > r_inner:
                factor = (r_outer - d) / (r_outer - r_inner)
                mask.putpixel((x, y), int(255 * factor))
    resized.putalpha(mask)
    
    canvas = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))
    pos = ((target_size - new_w) // 2, (target_size - new_h) // 2)
    canvas.paste(resized, pos, resized)
    return canvas

def make_legacy_square(crop_img, target_size, bg_color):
    canvas = Image.new('RGBA', (target_size, target_size), bg_color)
    desired_max = int(target_size * 0.75)
    w, h = crop_img.size
    scale = desired_max / max(w, h)
    new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
    resized = crop_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    pos = ((target_size - new_w) // 2, (target_size - new_h) // 2)
    canvas.paste(resized, pos, resized)
    return canvas

def make_legacy_round(crop_img, target_size, bg_color):
    sq = make_legacy_square(crop_img, target_size, bg_color)
    mask = create_circular_mask(target_size)
    round_canvas = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))
    round_canvas.paste(sq, (0, 0), mask)
    return round_canvas

def generate_all():
    print("[1/5] Extracting source mascot crops...")
    # 1. Main / Default (Runner Ninja Mascot)
    raw_main = make_transparent_by_floodfill(os.path.join(LOGO_DIR, 'mainlogo.png'), tolerance=35)
    crop_main = crop_transparent(raw_main)
    print(f"  Default Runner Ninja crop: {crop_main.size}")
    
    # 2. Sad
    raw_sad = make_transparent_by_floodfill(os.path.join(LOGO_DIR, 'sadlogo.png'), tolerance=35)
    crop_sad = crop_transparent(raw_sad)
    print(f"  Sad crop: {crop_sad.size}")
    
    # Colors
    bg_main = (255, 255, 255, 255)
    bg_sad = (255, 255, 255, 255)
    bg_angry = (54, 3, 6, 255)       # #360306
    bg_dramatic = (45, 47, 46, 255)   # #2D2F2E
    
    print("\n[2/5] Updating root Expo assets...")
    # Expo adaptive-icon.png (1024x1024 transparent foreground)
    expo_adaptive = make_foreground(crop_main, 1024, max_dimension_ratio=0.52)
    expo_adaptive.save(os.path.join(ASSETS_DIR, 'adaptive-icon.png'), 'PNG')
    print("  ✓ Saved assets/adaptive-icon.png")
    
    # Expo icon.png (1024x1024 direct from mainlogo.png)
    expo_icon = Image.open(os.path.join(LOGO_DIR, 'mainlogo.png')).convert('RGBA').resize((1024, 1024), Image.Resampling.LANCZOS)
    expo_icon.save(os.path.join(ASSETS_DIR, 'icon.png'), 'PNG')
    print("  ✓ Saved assets/icon.png (direct from mainlogo.png)")
    
    # Expo splash-icon.png (1024x1024 transparent splash)
    expo_splash = make_foreground(crop_main, 1024, max_dimension_ratio=0.55)
    expo_splash.save(os.path.join(ASSETS_DIR, 'splash-icon.png'), 'PNG')
    print("  ✓ Saved assets/splash-icon.png")
    
    # Expo favicon.png (512x512)
    expo_favicon = make_legacy_square(crop_main, 512, bg_main)
    expo_favicon.save(os.path.join(ASSETS_DIR, 'favicon.png'), 'PNG')
    print("  ✓ Saved assets/favicon.png")
    
    print("\n[3/5] Generating Android native mipmap densities...")
    for density, sizes in DENSITIES.items():
        mipmap_dir = os.path.join(RES_DIR, f'mipmap-{density}')
        drawable_dir = os.path.join(RES_DIR, f'drawable-{density}')
        os.makedirs(mipmap_dir, exist_ok=True)
        os.makedirs(drawable_dir, exist_ok=True)
        
        fg_size = sizes['fg']
        icon_size = sizes['icon']
        splash_size = sizes['splash']
        
        # --- DEFAULT ---
        fg = make_foreground(crop_main, fg_size, max_dimension_ratio=0.52)
        fg.save(os.path.join(mipmap_dir, 'ic_launcher_foreground.webp'), 'WEBP')
        
        sq = make_legacy_square(crop_main, icon_size, bg_main)
        sq.save(os.path.join(mipmap_dir, 'ic_launcher.webp'), 'WEBP')
        
        rd = make_legacy_round(crop_main, icon_size, bg_main)
        rd.save(os.path.join(mipmap_dir, 'ic_launcher_round.webp'), 'WEBP')
        
        # --- SAD ---
        fg_sad = make_foreground(crop_sad, fg_size, max_dimension_ratio=0.52)
        fg_sad.save(os.path.join(mipmap_dir, 'ic_launcher_foreground_sad.webp'), 'WEBP')
        
        sq_sad = make_legacy_square(crop_sad, icon_size, bg_sad)
        sq_sad.save(os.path.join(mipmap_dir, 'ic_launcher_sad.webp'), 'WEBP')
        
        rd_sad = make_legacy_round(crop_sad, icon_size, bg_sad)
        rd_sad.save(os.path.join(mipmap_dir, 'ic_launcher_sad_round.webp'), 'WEBP')
        
        # --- ANGRY ---
        fg_ang = make_feathered_foreground(os.path.join(LOGO_DIR, 'angrylogo.png'), fg_size, max_dimension_ratio=0.58)
        fg_ang.save(os.path.join(mipmap_dir, 'ic_launcher_foreground_angry.webp'), 'WEBP')
        
        sq_ang = Image.open(os.path.join(LOGO_DIR, 'angrylogo.png')).resize((icon_size, icon_size), Image.Resampling.LANCZOS)
        sq_ang.save(os.path.join(mipmap_dir, 'ic_launcher_angry.webp'), 'WEBP')
        
        mask_rd = create_circular_mask(icon_size)
        rd_ang = Image.new('RGBA', (icon_size, icon_size), (0, 0, 0, 0))
        rd_ang.paste(sq_ang, (0, 0), mask_rd)
        rd_ang.save(os.path.join(mipmap_dir, 'ic_launcher_angry_round.webp'), 'WEBP')
        
        # --- DRAMATIC ---
        fg_dram = make_feathered_foreground(os.path.join(LOGO_DIR, 'dramaticlogo.png'), fg_size, max_dimension_ratio=0.58)
        fg_dram.save(os.path.join(mipmap_dir, 'ic_launcher_foreground_dramatic.webp'), 'WEBP')
        
        sq_dram = Image.open(os.path.join(LOGO_DIR, 'dramaticlogo.png')).resize((icon_size, icon_size), Image.Resampling.LANCZOS)
        sq_dram.save(os.path.join(mipmap_dir, 'ic_launcher_dramatic.webp'), 'WEBP')
        
        rd_dram = Image.new('RGBA', (icon_size, icon_size), (0, 0, 0, 0))
        rd_dram.paste(sq_dram, (0, 0), mask_rd)
        rd_dram.save(os.path.join(mipmap_dir, 'ic_launcher_dramatic_round.webp'), 'WEBP')
        
        # --- NATIVE SPLASHSCREEN LOGO ---
        splash_img = make_foreground(crop_main, splash_size, max_dimension_ratio=0.60)
        splash_img.save(os.path.join(drawable_dir, 'splashscreen_logo.png'), 'PNG')
        
        print(f"  ✓ Processed mipmap-{density} & drawable-{density}")

    print("\n[4/5] Verifying safe-zone calculations...")
    im_check = Image.open(os.path.join(ASSETS_DIR, 'adaptive-icon.png'))
    w, h = im_check.size
    cx, cy = w / 2, h / 2
    safe_rad = (66 / 108) * (w / 2) # ~312.8px
    max_d = 0
    outside = 0
    for y in range(h):
        for x in range(w):
            if im_check.getpixel((x, y))[3] > 10:
                d = math.hypot(x - cx, y - cy)
                if d > max_d: max_d = d
                if d > safe_rad: outside += 1
    print(f"  Max radius in adaptive-icon: {max_d:.1f}px (Safe limit: {safe_rad:.1f}px)")
    print(f"  Pixels outside safe-zone: {outside} (Target: 0)")
    assert outside == 0, f"Error: {outside} pixels exceed safe zone!"
    print("  ✓ Safe zone test PASSED!")

if __name__ == '__main__':
    generate_all()
