import type { Preview, Decorator } from "@storybook/react";
import "../styles/globals.css";

/**
 * Dark mode decorator - .dark 클래스를 body에 토글하여 CSS 변수 전환
 */
const withDarkMode: Decorator = (Story, context) => {
  const isDark = context.globals?.backgrounds?.value === "#1a1a1a";

  if (typeof document !== "undefined") {
    document.body.classList.toggle("dark", isDark);
  }

  return Story();
};

const preview: Preview = {
  decorators: [withDarkMode],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "light",
      values: [
        { name: "light", value: "#ffffff" },
        { name: "dark", value: "#1a1a1a" },
      ],
    },
  },
};

export default preview;
