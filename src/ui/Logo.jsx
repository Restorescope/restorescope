/**
 * Logo — renders the real 1-800 WATER DAMAGE PNG.
 *
 * The PNG lives at /public/brand/logo.png so it's served at /brand/logo.png.
 * Use `size` for common variants, or `className` to fully customize.
 *
 * size options:
 *   'sm'  - 32px (header right-side, table rows)
 *   'md'  - 44px (default — main header)
 *   'lg'  - 64px (auth screens)
 *   'xl'  - 96px (report cover)
 *
 * The logo PNG has a black background; pair with a yellow or white surface
 * behind it. For most cases, just <Logo /> on the blue header works because
 * the diamond shape sits naturally on dark backgrounds.
 */
const SIZE_CLASS = {
  sm: 'w-8 h-8',
  md: 'w-11 h-11',
  lg: 'w-16 h-16',
  xl: 'w-24 h-24',
}

export default function Logo({ size = 'md', className = '', ariaLabel = '1-800 Water Damage of North Dakota' }) {
  const sizeClass = SIZE_CLASS[size] || SIZE_CLASS.md
  return (
    <img
      src="/brand/logo.png"
      alt={ariaLabel}
      className={`${sizeClass} object-contain ${className}`}
      draggable={false}
    />
  )
}
