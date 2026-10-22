// jsdom has no Element.scrollTo (every browser does). App pins the message log with it, so give
// jsdom a minimal version that only sets scrollTop.
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = function (this: Element, options?: ScrollToOptions | number) {
    if (typeof options === 'object' && options.top !== undefined) this.scrollTop = options.top;
  } as Element['scrollTo'];
}
