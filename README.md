
# PLCC Connect Ecosystem

## Mobile Responsiveness Contract
To maintain a high-quality user experience across all devices, all new features MUST adhere to this contract.

### Hard Rules
1. **320px Boundary**: The UI must never break or scroll horizontally at 320px width (iPhone SE).
2. **Touch Targets**: All interactive elements (buttons, links, inputs) must be at least **44x44px** in size.
3. **ResponsivePage Wrapper**: Every new page must be wrapped in `<ResponsivePage>` to ensure consistent padding and max-widths.
4. **Table Transformation**: Standard tables are forbidden on mobile. Use a **Card Grid** for screens smaller than `768px`.
5. **Form Stacking**: Multi-column forms must stack vertically on mobile. Use `grid-cols-1 md:grid-cols-2`.
6. **Safe Area Support**: Use `env(safe-area-inset-bottom)` for fixed bottom elements to avoid overlap with device hardware UI.
7. **Overflow Clamping**: Use `truncate`, `line-clamp-x`, or `break-words` for member emails, URLs, and long titles.
8. **Modals**: Must have a maximum height of `85vh` on mobile and include internal scrolling.
9. **Desktop Second**: Always design the mobile view first before adding complexity for desktop.
10. **Font Size**: Base text should be no smaller than `12px`, with labels being at least `9px` and bold.

### Deployment Checklist
- [ ] Tested on 320px width (no horizontal scroll).
- [ ] Checked iOS Safe Area padding on bottom navigation.
- [ ] Verified all buttons are easily clickable with a thumb.
- [ ] Verified that long member names don't break the layout.