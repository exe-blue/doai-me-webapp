# @doai/ui-automator

ADB UIAutomator wrapper for Android UI automation. Provides a high-level API for finding and interacting with Android UI elements.

## Features

- Parse UIAutomator XML dumps into structured data
- Find elements by text, resource ID, content description, class name
- Support for complex selectors (contains, startsWith)
- Click, long click, and text input operations
- Scroll gestures in all directions
- Wait for elements with timeout
- 500ms dump caching for performance

## Installation

```bash
npm install @doai/ui-automator
```

## Usage

### Basic Example

```typescript
import { AdbController } from '@doai/worker-core';
import { UIAutomator } from '@doai/ui-automator';

const adb = new AdbController();
const uiAutomator = new UIAutomator(adb);

// Find and click a button
const button = await uiAutomator.findByText('deviceSerial', 'Click Me');
if (button) {
  await uiAutomator.click('deviceSerial', button);
}
```

### Finding Elements

```typescript
// By exact text
const element = await uiAutomator.findByText(serial, 'Submit');

// By text containing substring
const element = await uiAutomator.findByTextContains(serial, 'ubmi');

// By resource ID
const element = await uiAutomator.findById(serial, 'com.app:id/button');

// By content description
const element = await uiAutomator.findByDescription(serial, 'Search');

// By class name (returns array)
const buttons = await uiAutomator.findByClass(serial, 'android.widget.Button');

// Using custom selector
const element = await uiAutomator.findElement(serial, {
  textContains: 'Search',
  clickable: true,
  enabled: true
});
```

### Interactions

```typescript
// Click an element
await uiAutomator.click(serial, element);

// Long click (1000ms default)
await uiAutomator.longClick(serial, element, 2000);

// Set text (clears first)
await uiAutomator.setText(serial, inputElement, 'Hello World');

// Scroll
await uiAutomator.scroll(serial, 'down', 300);
await uiAutomator.scroll(serial, 'up', 200);
```

### Waiting for Elements

```typescript
// Wait for element (10s default timeout)
const element = await uiAutomator.waitForElement(serial, {
  text: 'Loading Complete'
}, 15000);

// Wait for specific text
const element = await uiAutomator.waitForText(serial, 'Done', 5000);
```

### Direct Dump Access

```typescript
// Get all UI elements
const elements = await uiAutomator.dumpUI(serial);

// Force refresh (bypass 500ms cache)
const elements = await uiAutomator.dumpUI(serial, true);

// Parse XML directly
import { parseUIDump } from '@doai/ui-automator';
const xml = await adb.executeShell(serial, 'uiautomator dump /dev/tty');
const elements = parseUIDump(xml);
```

## API

### UIAutomator Class

#### Constructor
- `constructor(adb: AdbController)` - Initialize with ADB controller

#### Element Finding
- `dumpUI(serial: string, forceRefresh?: boolean): Promise<UIElement[]>` - Dump UI hierarchy
- `findElements(serial: string, selector: UISelector): Promise<UIElement[]>` - Find all matching elements
- `findElement(serial: string, selector: UISelector): Promise<UIElement | null>` - Find first matching element
- `findByText(serial: string, text: string): Promise<UIElement | null>` - Find by exact text
- `findByTextContains(serial: string, text: string): Promise<UIElement | null>` - Find by text substring
- `findByDescription(serial: string, desc: string): Promise<UIElement | null>` - Find by content description
- `findById(serial: string, resourceId: string): Promise<UIElement | null>` - Find by resource ID
- `findByClass(serial: string, className: string): Promise<UIElement[]>` - Find all by class name

#### Interactions
- `click(serial: string, element: UIElement): Promise<void>` - Click element center
- `longClick(serial: string, element: UIElement, durationMs?: number): Promise<void>` - Long click element
- `setText(serial: string, element: UIElement, text: string): Promise<void>` - Set element text
- `scroll(serial: string, direction: 'up' | 'down' | 'left' | 'right', distance?: number): Promise<void>` - Scroll gesture

#### Waiting
- `waitForElement(serial: string, selector: UISelector, timeoutMs?: number): Promise<UIElement>` - Wait for element
- `waitForText(serial: string, text: string, timeoutMs?: number): Promise<UIElement>` - Wait for text

### Types

#### UIElement
```typescript
interface UIElement {
  bounds: { left: number; top: number; right: number; bottom: number };
  text: string;
  contentDesc: string;
  resourceId: string;
  className: string;
  packageName: string;
  clickable: boolean;
  enabled: boolean;
  focused: boolean;
  scrollable: boolean;
  selected: boolean;
  checked: boolean;
  index: number;
}
```

#### UISelector
```typescript
interface UISelector {
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
```

## Performance

- UI dumps are cached for 500ms to reduce ADB overhead
- Use `forceRefresh: true` when elements may have changed
- Batch operations when possible to minimize dumps

## Requirements

- Android device with UIAutomator support (API 16+)
- ADB connection via `@doai/worker-core`

## License

MIT
