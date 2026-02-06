import type { UIElement } from './types';

/**
 * Parse UIAutomator XML dump into UIElement array
 */
export function parseUIDump(xml: string): UIElement[] {
  const elements: UIElement[] = [];

  // Match all <node> elements with their attributes
  const nodeRegex = /<node\s+([^>]+)\/>/g;
  let match: RegExpExecArray | null;

  while ((match = nodeRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const element = parseNodeAttributes(attrs);
    if (element) {
      elements.push(element);
    }
  }

  return elements;
}

/**
 * Parse attributes string from a node element
 */
function parseNodeAttributes(attrs: string): UIElement | null {
  try {
    const get = (name: string): string => {
      const match = attrs.match(new RegExp(`${name}="([^"]*)"`) );
      return match?.[1] ?? '';
    };

    const getBool = (name: string): boolean => get(name) === 'true';

    // Parse bounds: [left,top][right,bottom]
    const boundsStr = get('bounds');
    const boundsMatch = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!boundsMatch) return null;

    return {
      bounds: {
        left: parseInt(boundsMatch[1], 10),
        top: parseInt(boundsMatch[2], 10),
        right: parseInt(boundsMatch[3], 10),
        bottom: parseInt(boundsMatch[4], 10),
      },
      text: get('text'),
      contentDesc: get('content-desc'),
      resourceId: get('resource-id'),
      className: get('class'),
      packageName: get('package'),
      clickable: getBool('clickable'),
      enabled: getBool('enabled'),
      focused: getBool('focused'),
      scrollable: getBool('scrollable'),
      selected: getBool('selected'),
      checked: getBool('checked'),
      index: parseInt(get('index') || '0', 10),
    };
  } catch {
    return null;
  }
}
