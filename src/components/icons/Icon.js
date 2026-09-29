import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BOOTSTRAP_ICON_PATHS, BOOTSTRAP_VIEWBOX } from './bootstrapPaths';

/**
 * Bootstrap Icons renderer with the prop signature Ionicons had.
 *
 * The FAO design system builds on Bootstrap, so the icon set moved to Bootstrap
 * Icons with it. Keeping `name`/`size`/`color`/`style` identical meant the swap
 * was an import change at each call site rather than an edit to every icon, and
 * the taxonomy `icon:` values in constants.js and innovationHubRegions.js still
 * resolve — see bootstrapPaths.js for the name mapping.
 *
 * An unmapped name renders a blank box of the right size rather than throwing,
 * so a missed name costs an icon and not the screen around it.
 */
export default function Icon({ name, size = 16, color = '#000', style, ...rest }) {
  const paths = BOOTSTRAP_ICON_PATHS[name];

  if (!paths) {
    if (__DEV__ && name) {
      console.warn(`[Icon] no Bootstrap glyph mapped for "${name}"`);
    }
    return <View style={[{ width: size, height: size }, style]} />;
  }

  return (
    <View style={[{ width: size, height: size }, style]} {...rest}>
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${BOOTSTRAP_VIEWBOX} ${BOOTSTRAP_VIEWBOX}`}
        fill={color}
      >
        {paths.map((p, i) => (
          <Path
            key={i}
            d={p.d}
            fill={color}
            fillRule={p.evenOdd ? 'evenodd' : undefined}
            clipRule={p.evenOdd ? 'evenodd' : undefined}
          />
        ))}
      </Svg>
    </View>
  );
}
