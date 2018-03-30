/* eslint-env qunit */
import document from 'global/document';
import window from 'global/window';
import {getAbsoluteURL} from '../utils/url';
import * as browser from '../utils/browser';
import mergeOptions from '../utils/merge-options';

export const supportsErrorRecovery = (function() {
  return browser.IS_CHROME || browser.IS_EDGE;
})();

const polyCustomEvent = function(type, params) {
  params = params || {};
  params = mergeOptions({bubbles: false, cancelable: false, detail: undefined }, params);

  const event = document.createEvent('CustomEvent');

  event.initCustomEvent(type, params.bubbles, params.cancelable, params.detail);

  return event;
};

// so that video.js can still be node required
if (window.Event) {
  polyCustomEvent.prototype = window.Event.prototype;
}

const CustomEvent = typeof window.CustomEvent === 'function' ? window.CustomEvent : polyCustomEvent;

/**
 * This function is used to verify if there is a source value on an element.
 * We need this because an empty string source returns `window.location.href` on
 * el.src but does not on el.getAttribute('src'). Furthermore we always want the
 * absolute source and el.getAttribute('src') always returns the source that was
 * passed in, which may be relative. While el.src always returns the absolute
 *
 * @param {Element} el
 *        The html element to get the source for.
 *
 * @return {string}
 *         The absolute url to the source or empty string if there is no source.
 */
const getSrc = (el) => {
  // We use the attribute to check if a source is set because when
  // the source for the element is set to a blank string. The attribute will
  // return '' and the property will return window.location.href.
  if (el.getAttribute('src')) {
    return el.src;
  }

  return '';
};

/**
 * Run a partial source selection algorithm and get the source that should be selected.
 * We return empty string in two cases:
 * 1. There are no sources
 * 2. There is more than one <source> element with different urls
 *
 * if we had a full source selection algorithm we would do #2 but there isn't much benefit.
 *
 * @param {HTMLMediaElement} el
 *        the media element to run source selection on
 *
 * @param {NodeList} [sources]
 *        The list of sources that a children of the HTMLMediaElement.
 *        This should only be passed in if it was needed before source selection.
 *
 * @return {string}
 *          The source that will be selected or empty string if there isn't one or we
 *          don't know what source will be selected.
 */
const runSourceSelection = (el, sources) => {
  if (el.hasAttribute('src')) {
    return getSrc(el);
  }

  // source are either passed in by a function that uses needs them before us
  // or we need to find them ourselves
  sources = sources || el.getElementsByTagName('source');

  if (sources.length === 0) {
    return '';
  }

  const srcUrls = [];
  let src = null;

  // only count valid/non-duplicate source elements
  for (let i = 0; i < sources.length; i++) {
    // We do not use the property here because the property will
    // return window.location.href when src is set to an empty string
    const url = getSrc(sources[i]);

    if (url && srcUrls.indexOf(url) === -1) {
      srcUrls.push(url);
    }
  }

  // there were no valid sources
  if (!srcUrls.length) {
    return '';
  }

  // there is only one valid source element url
  // use that
  if (srcUrls.length === 1) {
    src = srcUrls[0];
  }

  return src;
};

/**
 * Trigger the custom `sourceset` event on the native element.
 * this will include what we think the currentSrc will be as a detail.
 *
 * @param {HTMLMediaElement} el
 *        The tech element that the `sourcest` should trigger on
 *
 * @param {string} src
 *        The string to trigger as the source
 */
const triggerSourceset = (el, src) => {
  if (typeof src !== 'string') {
    src = '';
  }

  el.dispatchEvent(new CustomEvent('sourceset', {detail: {src}}));
};

/**
 * our implementation of a `innerHTML` descriptor for browsers
 * that do not have one
 */
const innerHTMLDescriptorPolyfill = {
  get() {
    return this.cloneNode(true).innerHTML;
  },
  set(v) {
    // make a dummy node to use innerHTML on
    const dummy = document.createElement(this.nodeName.toLowerCase());

    // set innerHTML to the value provided
    dummy.innerHTML = v;

    // make a document fragment to hold the nodes from dummy
    const docFrag = document.createDocumentFragment();

    // copy all of the nodes created by the innerHTML on dummy
    // to the document fragment
    while (dummy.childNodes.length) {
      docFrag.appendChild(dummy.childNodes[0]);
    }

    // remove content
    this.innerText = '';

    // now we add all of that html in one by appending the
    // document fragment. This is how innerHTML does it.
    window.Element.prototype.appendChild.call(this, docFrag);

    // then return the result that innerHTML's setter would
    return this.innerHTML;
  },
  enumerable: true,
  configurable: true
};

/**
 * our implementation of a `src` descriptor for browsers
 * that do not have one
 */
const srcDescriptorPolyfill = {
  get() {
    if (this.hasAttribute('src')) {
      return getAbsoluteURL(window.Element.prototype.getAttribute.call(this, 'src'));
    }

    return '';
  },
  set(v) {
    window.Element.prototype.setAttribute.call(this, 'src', v);

    return v;
  },
  enumerable: true,
  configurable: true
};

/**
 * First we try to patch the src property just using the native descriptor.
 * If there isn't a native descriptor we have to polyfill a descriptor which
 * means that we also have to overwrite `setAttribute` and `removeAttribute`
 * property as those would be modified by the native descriptor.
 *
 * @param {HTMLMediaElement} el
 *        The tech element that should have its `src` property patched
 *
 * @param {boolean} [forcePolyfill=false]
 *        force the descriptor polyfill to be used, should only be used for tests.
 *
 */
const patchSrcProperty = (el, forcePolyfill = false) => {
  const proto = window.HTMLMediaElement.prototype;
  let descriptor = {};

  // preserve getters/setters already on `el.src` if they exist
  if (!forcePolyfill && Object.getOwnPropertyDescriptor(el, 'src')) {
    descriptor = Object.getOwnPropertyDescriptor(el, 'src');
  } else if (!forcePolyfill && Object.getOwnPropertyDescriptor(proto, 'src')) {
    descriptor = Object.getOwnPropertyDescriptor(proto, 'src');
  }

  if (!descriptor.set || !descriptor.get) {
    descriptor = srcDescriptorPolyfill;
  }

  descriptor.enumerable = descriptor.enumerable || srcDescriptorPolyfill.enumerable;
  descriptor.configurable = descriptor.configurable || srcDescriptorPolyfill.configurable;

  Object.defineProperty(el, 'src', mergeOptions(descriptor, {
    set(...args) {
      const retval = descriptor.set.apply(el, args);

      // ie and edge fire loadstart with el.src
      // even if the attribute is an empty string
      // other browsers do not
      if ((browser.IE_VERSION || browser.IS_EDGE)) {
        triggerSourceset(el, el.src);
      } else {
        triggerSourceset(el, getSrc(el));
      }

      return retval;
    }
  }));
};

const watchForInnerHTMLSource = function(el, forcePolyfill = false) {
  if (el.watchForInnerHTMLSource_) {
    return;
  }
  el.watchForInnerHTMLSource_ = true;
  let descriptor = {};

  // we have to force the innerHTML polyfill on safari
  // as it loads sources from bottom to top when using
  // the native innerHTML, which is against the spec.
  if (browser.IS_ANY_SAFARI) {
    // forcePolyfill = true;
  }

  // preserve native getters/setters already on `el.innerHTML` if they exist
  if (!forcePolyfill && Object.getOwnPropertyDescriptor(el, 'innerHTML')) {
    descriptor = Object.getOwnPropertyDescriptor(el, 'innerHTML');
  } else if (!forcePolyfill && Object.getOwnPropertyDescriptor(window.HTMLMediaElement.prototype, 'innerHTML')) {
    descriptor = Object.getOwnPropertyDescriptor(window.HTMLMediaElement.prototype, 'innerHTML');
  } else if (!forcePolyfill && Object.getOwnPropertyDescriptor(window.Element.prototype, 'innerHTML')) {
    descriptor = Object.getOwnPropertyDescriptor(window.Element.prototype, 'innerHTML');
  }

  if (!descriptor.set || !descriptor.get) {
    descriptor = innerHTMLDescriptorPolyfill;
  }

  descriptor.enumerable = descriptor.enumerable || innerHTMLDescriptorPolyfill.enumerable;
  descriptor.configurable = descriptor.configurable || innerHTMLDescriptorPolyfill.configurable;

  Object.defineProperty(el, 'innerHTML', mergeOptions(descriptor, {
    set(...args) {
      const retval = descriptor.set.apply(el, args);
      const sources = el.getElementsByTagName('source');

      // if there were no previous sources
      if (sources.length) {
        triggerSourceset(el, runSourceSelection(el, sources));
      }

      return retval;
    }
  }));

  const resetOnSourceset = (e) => {
    el.watchForInnerHTMLSource_ = false;
    Object.defineProperty(el, 'innerHTML', descriptor);
    el.removeEventListener('sourceset', resetOnSourceset);

    if (browser.IS_ANY_SAFARI) {
      watchForInnerHTMLSource(el, forcePolyfill);
    }
  };

  el.addEventListener('sourceset', resetOnSourceset);
};

/**
 * This function patches `append`, `appendChild`, `innerHTML`, and
 * `insertAdjacentHTML` to detect when a source is first added to
 * a media element. Once a source is set, these properties/methods will
 * be set back to their original state.
 *
 * @param {HTMLMediaElement} el
 *        the media element to run source selection on
 *
 * @param {boolean} [forcePolyfill=false]
 *        Force the descriptor polyfills to be used, should only be used for tests.
 */
const watchForFirstSource = function(el, forcePolyfill = false) {
  if (el.watchForFirstSource_) {
    return;
  }

  watchForInnerHTMLSource(el, forcePolyfill);

  const oldFn = {};
  const appendWrapper = (appendFn) => (...args) => {
    const retval = appendFn(args);
    const sources = el.getElementsByTagName('source');

    if (sources.length) {
      triggerSourceset(el, runSourceSelection(el, sources));
    }

    return retval;
  };

  ['append', 'appendChild', 'insertAdjacentHTML'].forEach((m) => {
    // only support functions that have browser support
    if (!el[m]) {
      return;
    }
    // save old function
    oldFn[m] = el[m];
    el[m] = appendWrapper((args) => oldFn[m].apply(el, args));
  });

  const resetOnSourceset = (e) => {
    Object.keys(oldFn).forEach((m) => {
      el[m] = oldFn[m].bind(el);
    });

    el.watchForFirstSource_ = false;
    el.removeEventListener('sourceset', resetOnSourceset);
  };

  el.addEventListener('sourceset', resetOnSourceset);
};

/**
 * This function patches `src`, `setAttribute`, and `load` to detect when a source is set on the media element.
 * It will fire a custom event called `sourceset` when  that happens.
 *
 * > NOTE: It will also override the function in listed `watchForFirstSource()` when there
 *         is no source in the media element at first and when their is no source in the
 *         media element on `load()`.
 *
 * > NOTE: This function will also put a minor wrapper around `removeAttribute` when
 *         there is no native descriptor for the `src` property.
 *
 * @param {HTMLMediaElement} el
 *        the media element to add the `sourceset` event to
 *
 * @param {boolean} [forcePolyfill=false]
 *        Force the descriptor polyfills to be used, should only be used for tests.
 *
 * @return {HTMLMediaElement}
 *         the element with `sourceset` added on
 */
export const patchSourceset = function(el, forcePolyfill) {
  // only patch sourceset if it hasn'd been done yet
  if (el.patchSourceset_) {
    return;
  }

  el.patchSourceset_ = true;

  // patch the src property
  patchSrcProperty(el, forcePolyfill);

  const oldFn = {
    load: el.load,
    setAttribute: el.setAttribute,
    removeAttribute: el.removeAttribute
  };

  el.load = function() {
    const retval = oldFn.load.call(el);
    const sources = el.getElementsByTagName('source');

    // only trigger sourceset if there is something to load
    triggerSourceset(el, runSourceSelection(el, sources));

    // otherwise watch for the first source append
    if (!el.hasAttribute('src') && sources.length === 0) {
      watchForFirstSource(el, forcePolyfill);
    }

    return retval;
  };

  el.setAttribute = function(...args) {
    const retval = oldFn.setAttribute.apply(el, args);

    if ((/^src/i).test(args[0])) {
      // ie and edge fire loadstart with el.src
      // even if the attribute is an empty string
      if ((browser.IE_VERSION || browser.IS_EDGE)) {
        triggerSourceset(el, el.src);
      } else {
        triggerSourceset(el, getSrc(el));
      }
    }

    return retval;
  };

  if (supportsErrorRecovery) {
    el.addEventListener('error', function(e) {
      if (!el.hasAttribute('src')) {
        watchForFirstSource(el, forcePolyfill);
      }
    });
  }

  el.removeAttribute = function(...args) {
    let hadBadSrc = false;

    if (el.hasAttribute('src')) {
      if (supportsErrorRecovery && el.error) {
        hadBadSrc = true;
      } else if (!el.currentSrc) {
        hadBadSrc = true;
      }
      /* } else if (browser.IS_EDGE && el.networkState === 2 || el.networkState === 3) {
        hadBadSrc = true;
      } */
    }
    const retval = oldFn.removeAttribute.apply(el, args);

    if (hadBadSrc && (/^src/i).test(args[0])) {
      watchForFirstSource(el, forcePolyfill);
    }

    return retval;
  };

  const sources = el.getElementsByTagName('source');

  // trigger a sourceset right away if there is a source while patching
  if (el.hasAttribute('src') || sources.length > 0) {
    triggerSourceset(el, runSourceSelection(el, sources));
  // otherwise watch for the first source append
  } else {
    watchForFirstSource(el, forcePolyfill);
  }

  return el;
};
