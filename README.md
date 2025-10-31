# 🍪 ZenCookies - Handcrafted Artisan Cookie Website

A beautiful, minimalist Astro JS website for selling handcrafted cookies with stunning animations and a focus on user experience.

## ✨ Features

### 🎨 Design & Aesthetics
- **Minimalist & Modern**: Clean design with warm, cookie-themed colors
- **Premium Typography**: Playfair Display for headings, Inter for body text
- **Gradient Text Effects**: Beautiful gradient animations on headings
- **Glass Morphism**: Modern frosted glass effects on cards and buttons
- **Smooth Animations**: Fade-in reveals, floating elements, shine effects, and more

### 📱 Fully Responsive
- Mobile-first approach with breakpoints at 768px and 480px
- Touch-friendly buttons and navigation
- Optimized layouts for all screen sizes

### 🌍 Location-Specific
- **Serving Johor Bahru** - Free delivery across the JB area
- Prominent delivery banner at the top

### 💬 WhatsApp Integration
- Floating button with pulse animation
- Large contact button in contact section

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## � Customization

### Update WhatsApp Number
In `src/pages/index.astro`, replace `1234567890` with your actual number:
```astro
<a href="https://wa.me/60123456789" ...>  <!-- Malaysian format -->
```

### Modify Cookie Menu
Edit the `cookies` array in `src/pages/index.astro` to add/remove items or change prices.

### Change Colors
Update CSS variables in `src/layouts/Layout.astro`:
```css
:root {
  --color-primary: #8B7355;
  --color-secondary: #D4A574;
  /* ... */
}
```

---

**Made with 💖 and 🍪 for Johor Bahru**
