/**
 * Metro turns .svg imports into React components via react-native-svg-transformer.
 * Jest has no such transform, so an .svg import arrives as an object and React
 * rejects it as an element type. This stands in as a inert component.
 */
const React = require('react');
const { View } = require('react-native');

const SvgMock = React.forwardRef((props, ref) =>
  React.createElement(View, { ...props, ref, testID: props.testID ?? 'svg-mock' })
);
SvgMock.displayName = 'SvgMock';

module.exports = SvgMock;
module.exports.default = SvgMock;
module.exports.ReactComponent = SvgMock;
