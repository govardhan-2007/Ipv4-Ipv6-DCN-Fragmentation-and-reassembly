# IPv6 V3.3 — Mobile Sidebar Scroll Fix

## What changed
- Replaced the nested mobile navigation scroll region with one scrollable sidebar surface.
- The complete sidebar now scrolls from the brand/course card through navigation, readiness status, and the expanded IPv6 Voice Assistant.
- Removed the mobile max-height cap on the expanded voice assistant so its controls are reachable by scrolling the sidebar.
- Preserved the fixed mobile drawer position, overlay behaviour, and safe-area spacing.
- Changes are limited to `ipv6/css/v6.css`; the IPv4 files and logic are not modified.

## Test
Open `ipv6/index.html` with Live Server at a narrow viewport. Open the mobile menu, expand the IPv6 Voice Assistant, then swipe vertically over the sidebar from the voice assistant area. The whole sidebar should move, including the voice controls at the bottom.
