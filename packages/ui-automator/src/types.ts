/**
 * Represents a UI element parsed from UIAutomator dump
 */
export interface UIElement {
  /** Element bounds rectangle */
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  /** Element text content */
  text: string;
  /** Content description (accessibility) */
  contentDesc: string;
  /** Resource ID (e.g., com.google.android.youtube:id/search_icon) */
  resourceId: string;
  /** Android class name (e.g., android.widget.Button) */
  className: string;
  /** Package name */
  packageName: string;
  /** Whether the element is clickable */
  clickable: boolean;
  /** Whether the element is enabled */
  enabled: boolean;
  /** Whether the element is focused */
  focused: boolean;
  /** Whether the element is scrollable */
  scrollable: boolean;
  /** Whether the element is selected */
  selected: boolean;
  /** Whether the element is checked */
  checked: boolean;
  /** Element index in parent */
  index: number;
}

/**
 * Selector for finding UI elements
 */
export interface UISelector {
  text?: string;
  textContains?: string;
  textStartsWith?: string;
  contentDesc?: string;
  contentDescContains?: string;
  resourceId?: string;
  resourceIdContains?: string;
  className?: string;
  packageName?: string;
  clickable?: boolean;
  enabled?: boolean;
  scrollable?: boolean;
}
