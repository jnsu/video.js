/* eslint-env qunit */
import window from 'global/window';
import document from 'global/document';
import {patchSourceset, supportsErrorRecovery} from '../../src/js/tech/patch-sourceset';
import * as browser from '../../src/js/utils/browser.js';

let wait = 50;

if (browser.IS_EDGE) {
  wait = 250;
}
const sourceOne = {src: 'http://vjs.zencdn.net/v/oceans.mp4', type: 'video/mp4'};
const sourceTwo = {src: 'http://d2zihajmogu5jn.cloudfront.net/elephantsdream/ed_hd.mp4', type: 'video/mp4'};
const fakeSource = {src: 'http://not-a-real-source-at-all.com/fake', type: ''};
const relative = {src: 'relative.mp4', type: 'video/mp4'};

const singleTypes = [
  {name: 'src', fn: (el, v) => {el.src = v;}}, // eslint-disable-line
  {name: 'setAttribute', fn: (el, v) => el.setAttribute('src', v)}
];

const appendTypes = [
  {name: 'appendChild', fn: (el, obj) => el.appendChild(obj)},
  {name: 'innerHTML', fn: (el, obj) => {el.innerHTML = el.innerHTML + obj.outerHTML;}}, // eslint-disable-line
];

// ie does not support this and safari < 10 does not either
if (window.Element.prototype.append) {
  appendTypes.push({name: 'append', fn: (el, obj) => el.append(obj)});
}

if (window.Element.prototype.insertAdjacentHTML) {
  appendTypes.push({name: 'insertAdjacentHTML', fn: (el, obj) => el.insertAdjacentHTML('beforeend', obj.outerHTML)});
}

// we could also add, 'audio'  and  'video with polyfills' here
// but its probably not necessary.
const testTypes = ['video', 'audio with polyfills'];

QUnit.module('patch-sourceset', () => testTypes.forEach((testType) => QUnit.module(testType, () => {
  const getHooks = function(totalEvents) {
    return {
      beforeEach(assert) {
        if (browser.IE_VERSION || browser.IS_EDGE) {
          assert.timeout(10000);
        }
        this.fixture = document.getElementById('qunit-fixture');
        if ((/audio/i).test(testType)) {
          this.el = document.createElement('audio');
        } else {
          this.el = document.createElement('video');
        }
        this.eventListeners_ = [];

        const oldAddEventListner = this.el.addEventListener;

        this.el.addEventListener = (...args) => {
          const retval = oldAddEventListner.apply(this.el, args);

          this.eventListeners_.push({type: args[0], fn: args[1]});

          return retval;
        };

        this.el.one = function(type, fn) {
          const func = function() {
            this.removeEventListener(type, func);
            fn.apply(this, arguments);
          };

          this.addEventListener(type, func);
        };

        if ((/polyfill/i).test(testType)) {
          this.el = patchSourceset(this.el, true);
        } else {
          this.el = patchSourceset(this.el);
        }

        this.el.on = this.el.addEventListener;
        this.el.off = this.el.removeEventListener;

        this.events = [];
        this.sourcesets = [];
        this.loadstarts = [];

        this.el.on('sourceset', (e) => {
          this.sourcesets.push(e.detail.src);
        });

        this.el.on('loadstart', (e) => {
          this.loadstarts.push(this.el.currentSrc);
        });

        this.fixture.appendChild(this.el);

        this.totalSourcesets = totalEvents;
        this.totalLoadstarts = totalEvents;
        this.eventEquals = () => {
          assert.deepEqual(this.sourcesets, this.loadstarts, 'sourcesets(result) and loadstarts(expected) should be the same');
        };
      },
      afterEach(assert) {
        const done = assert.async();

        window.setTimeout(() => {

          assert.equal(this.sourcesets.length, this.totalSourcesets, `should have ${this.totalSourcesets} sourcesets`);
          assert.equal(this.loadstarts.length, this.totalLoadstarts, `should have ${this.totalLoadstarts} loadstarts`);
          this.eventEquals(assert);

          this.eventListeners_.forEach((listener) => {
            this.el.removeEventListener(listener.type, listener.fn);
          });
          this.el = null;
          this.fixture.innerHTML = '';

          done();
        }, wait);
      }
    };
  };

  QUnit.module('single', getHooks(1));
  singleTypes.forEach((s) => {
    QUnit.test(`${s.name} blank`, function(assert) {
      const done = assert.async();

      this.el.on('loadstart', done);

      s.fn(this.el, '');
    });

    QUnit.test(`${s.name} valid`, function(assert) {
      const done = assert.async();

      this.el.on('loadstart', done);

      s.fn(this.el, sourceOne.src);
    });

    QUnit.test(`${s.name} relative`, function(assert) {
      const done = assert.async();

      this.el.on('loadstart', done);

      s.fn(this.el, relative.src);
    });
  });

  appendTypes.forEach((a) => {
    QUnit.test(`${a.name} <p>`, function(assert) {
      this.totalLoadstarts = 0;
      this.totalSourcesets = 0;

      const p = document.createElement('p');

      a.fn(this.el, p);
    });

    QUnit.test(`${a.name} <source> no src`, function(assert) {
      // IE/EDGE do not trigger a loadstart when a invalid <source> is appended
      if (browser.IE_VERSION || browser.IS_EDGE) {
        this.totalSourcesets = 1;
        this.totalLoadstarts = 0;
        this.eventEquals = () => {
          assert.equal(this.sourcesets[0], '', 'empty sourceset');
        };
      } else {
        this.el.on('loadstart', assert.async());
      }

      const source = document.createElement('source');

      a.fn(this.el, source);
    });

    QUnit.test(`${a.name} <source> blank src`, function(assert) {
      // IE/EDGE do not trigger a loadstart when a invalid <source> is appended
      if (browser.IE_VERSION || browser.IS_EDGE) {
        this.totalSourcesets = 1;
        this.totalLoadstarts = 0;
        this.eventEquals = () => {
          assert.equal(this.sourcesets[0], '', 'empty sourceset');
        };
      } else {
        this.el.on('loadstart', assert.async());
      }

      const source = document.createElement('source');

      source.src = '';

      a.fn(this.el, source);
    });

    QUnit.test(`${a.name} <source> src prop`, function(assert) {
      const done = assert.async();

      this.el.on('loadstart', done);

      const source = document.createElement('source');

      source.src = sourceOne.src;
      a.fn(this.el, source);
    });

    QUnit.test(`${a.name} <source> src attr`, function(assert) {
      const done = assert.async();

      this.el.on('loadstart', done);

      const source = document.createElement('source');

      source.setAttribute('src', sourceOne.src);
      a.fn(this.el, source);
    });

    QUnit.test(`${a.name} <source> src relative`, function(assert) {
      const done = assert.async();

      this.el.on('loadstart', done);

      const source = document.createElement('source');

      source.setAttribute('src', relative.src);
      a.fn(this.el, source);
    });
  });

  QUnit.test('load', function(assert) {
    this.totalSourcesets = 1;
    this.totalLoadstarts = 0;

    this.eventEquals = () => {
      assert.equal(this.sourcesets[0], '', 'blank string sourceset');
    };

    this.el.load();
  });

  QUnit.test('setAttribute with capital SRC', function(assert) {
    const done = assert.async();

    this.el.on('loadstart', done);

    this.el.setAttribute('SRC', sourceOne.src);
  });

  QUnit.test('append two <source> with different urls', function(assert) {
    const done = assert.async();

    this.eventEquals = () => {
      assert.equal(this.sourcesets[0], '', 'sourceset is blank string as we cannot know source');
    };
    this.el.on('loadstart', done);

    const s1 = document.createElement('source');
    const s2 = document.createElement('source');

    s1.setAttribute('src', sourceOne.src);
    s2.setAttribute('src', sourceTwo.src);

    this.el.innerHTML = s1.outerHTML + s2.outerHTML;
  });

  QUnit.test('append <source> one valid one blank', function(assert) {
    const done = assert.async();

    this.el.on('loadstart', done);

    const s1 = document.createElement('source');
    const s2 = document.createElement('source');

    s1.setAttribute('src', sourceOne.src);
    s2.setAttribute('src', '');

    this.el.innerHTML = s1.outerHTML + s2.outerHTML;
  });

  QUnit.test('append <source> one valid one no source', function(assert) {
    const done = assert.async();

    this.el.on('loadstart', done);

    const s1 = document.createElement('source');
    const s2 = document.createElement('source');

    s1.setAttribute('src', sourceOne.src);

    this.el.innerHTML = s1.outerHTML + s2.outerHTML;
  });

  QUnit.test('append <source> same urls', function(assert) {
    const done = assert.async();

    this.el.on('loadstart', done);

    const s1 = document.createElement('source');
    const s2 = document.createElement('source');

    s1.setAttribute('src', sourceOne.src);
    s2.setAttribute('src', sourceOne.src);

    this.el.innerHTML = s1.outerHTML + s2.outerHTML;
  });

  QUnit.test('append many <source> but only one valid url', function(assert) {
    const done = assert.async();

    this.el.on('loadstart', done);

    const s1 = document.createElement('source');
    const s2 = document.createElement('source');
    const s3 = document.createElement('source');
    const s4 = document.createElement('source');
    const s5 = document.createElement('source');

    s1.setAttribute('src', sourceOne.src);
    s2.setAttribute('src', sourceOne.src);
    s3.setAttribute('src', '');
    s5.setAttribute('src', '');

    this.el.innerHTML = s1.outerHTML + s2.outerHTML + s3.outerHTML + s4.outerHTML + s5.outerHTML;
  });

  QUnit.module('sequential', getHooks(2));
  singleTypes.forEach((s1) => {
    singleTypes.forEach((s2) => {
      QUnit.test(`${s1.name} -> ${s2.name}`, function(assert) {
        const done = assert.async(2);

        // on the first loadstart cause another
        this.el.one('loadstart', () => s2.fn(this.el, sourceTwo.src));
        this.el.on('loadstart', done);

        s1.fn(this.el, sourceOne.src);
      });

      QUnit.test(`${s1.name} -> ${s2.name} -> load`, function(assert) {
        const done = assert.async(3);

        this.totalSourcesets = 3;
        this.totalLoadstarts = 3;

        // on the first loadstart cause another
        this.el.one('loadstart', () => {
          // on the second loadstart cause another
          this.el.one('loadstart', () => this.el.load());
          s2.fn(this.el, sourceTwo.src);
        });
        this.el.on('loadstart', done);

        s1.fn(this.el, sourceOne.src);
      });

      QUnit.test(`${s1.name} -> removeAttribute -> ${s2.name}`, function(assert) {
        const done = assert.async(2);

        // on the first loadstart cause another
        this.el.one('loadstart', () => {
          this.el.removeAttribute('src');
          window.setTimeout(() => s2.fn(this.el, sourceTwo.src), wait);
        });
        this.el.on('loadstart', done);

        s1.fn(this.el, sourceOne.src);
      });

      QUnit.test(`${s1.name} -> removeAttribute -> ${s2.name} -> load`, function(assert) {
        const done = assert.async(3);

        this.totalSourcesets = 3;
        this.totalLoadstarts = 3;

        // on the first loadstart cause another
        this.el.one('loadstart', () => {
          // on the second loadstart cause another
          this.el.one('loadstart', () => this.el.load());

          this.el.removeAttribute('src');
          window.setTimeout(() => s2.fn(this.el, sourceTwo.src), wait);
        });
        this.el.on('loadstart', done);

        s1.fn(this.el, sourceOne.src);
      });
    });

    QUnit.test(`${s1.name} -> load`, function(assert) {
      const done = assert.async(2);

      this.el.one('loadstart', () => this.el.load());
      this.el.on('loadstart', done);

      s1.fn(this.el, sourceOne.src);
    });

    QUnit.test(`${s1.name} -> removeAttribute -> load`, function(assert) {
      const done = assert.async();

      this.totalSourcesets = 2;
      this.totalLoadstarts = 1;

      this.eventEquals = () => {
        assert.equal(this.loadstarts[0], this.sourcesets[0], 'first sourceset same as loadstart');
        assert.deepEqual(this.sourcesets[1], '', 'second is blank');
      };

      this.el.one('loadstart', () => {
        this.el.removeAttribute('src');
        window.setTimeout(() => {
          this.el.load();
          done();
        }, wait);
      });

      s1.fn(this.el, sourceOne.src);
    });
  });

  appendTypes.forEach((a1) => {
    singleTypes.forEach((s) => {
      QUnit.test(`${s.name} -> ${a1.name}`, function(assert) {
        const done = assert.async(1);

        this.totalSourcesets = 1;
        this.totalLoadstarts = 1;

        this.el.on('loadstart', () => {
          const source = document.createElement('source');

          source.src = sourceTwo.src;

          a1.fn(this.el, source);
          done();
        });

        s.fn(this.el, sourceOne.src);
      });

      QUnit.test(`${a1.name} -> ${s.name}`, function(assert) {
        const done = assert.async(2);

        this.el.one('loadstart', () => s.fn(this.el, sourceTwo.src));
        this.el.on('loadstart', done);

        const source = document.createElement('source');

        source.src = sourceOne.src;

        a1.fn(this.el, source);
      });

      QUnit.test(`${s.name} -> ${a1.name} -> load`, function(assert) {
        const done = assert.async(2);
        const s2 = document.createElement('source');

        s2.src = sourceTwo.src;

        this.el.one('loadstart', () => {
          a1.fn(this.el, s2);
          window.setTimeout(() => this.el.load(), wait);
        });
        this.el.on('loadstart', done);

        s.fn(this.el, sourceOne.src);
      });

      QUnit.test(`${s.name} -> removeAttribute -> ${a1.name}`, function(assert) {
        let done;
        const s2 = document.createElement('source');

        if (browser.IE_VERSION) {
          done = assert.async(2);
        } else {
          this.totalSourcesets = 1;
          this.totalLoadstarts = 1;
          done = assert.async(1);
        }

        s2.src = sourceTwo.src;

        this.el.one('loadstart', () => {
          this.el.removeAttribute('src');
          window.setTimeout(() => a1.fn(this.el, s2), wait);
        });

        this.el.on('loadstart', done);

        s.fn(this.el, sourceOne.src);
      });

      QUnit.test(`${s.name} -> removeAttribute -> ${a1.name} -> load`, function(assert) {
        let done;
        const s2 = document.createElement('source');

        s2.src = sourceTwo.src;

        if (browser.IE_VERSION) {
          done = assert.async(3);
          this.totalSourcesets = 3;
          this.totalLoadstarts = 3;
        } else {
          this.totalSourcesets = 2;
          this.totalLoadstarts = 2;
          done = assert.async(2);
        }

        this.el.one('loadstart', () => {
          this.el.removeAttribute('src');
          window.setTimeout(() => {
            window.setTimeout(() => this.el.load());
            a1.fn(this.el, s2);
          }, wait);
        });

        this.el.on('loadstart', done);

        s.fn(this.el, sourceOne.src);
      });
    });

    appendTypes.forEach((a2) => {
      QUnit.test(`${a1.name} -> ${a2.name}`, function(assert) {
        const done = assert.async();

        this.totalSourcesets = 1;
        this.totalLoadstarts = 1;
        const s1 = document.createElement('source');
        const s2 = document.createElement('source');

        s1.src = sourceOne.src;
        s2.src = sourceTwo.src;

        this.el.on('loadstart', () => {
          a2.fn(this.el, s2);
          done();
        });

        a1.fn(this.el, s1);
      });

      QUnit.test(`${a1.name} -> removeAttribute -> ${a2.name}`, function(assert) {
        const done = assert.async();
        const s1 = document.createElement('source');
        const s2 = document.createElement('source');

        if (browser.IE_VERSION) {
          this.eventEquals = () => {
            assert.equal(this.sourcesets[0], this.loadstarts[0], 'first loadstart equals first sourceset');
            assert.equal(this.sourcesets[1], '', 'second sourceset is empty string as we can not know source');
          };
        } else {
          this.totalSourcesets = 1;
          this.totalLoadstarts = 1;
          this.eventEquals = () => {
            assert.equal(this.sourcesets[0], this.loadstarts[0], 'first loadstart equals first sourceset');
          };
        }

        s1.src = sourceOne.src;
        s2.src = sourceTwo.src;

        this.el.one('loadstart', () => {
          this.el.removeAttribute('src');
          window.setTimeout(() => {
            a2.fn(this.el, s2);
            done();
          }, wait);
        });

        a1.fn(this.el, s1);
      });

      QUnit.test(`${a1.name} -> ${a2.name} -> load`, function(assert) {
        const done = assert.async(2);
        const s1 = document.createElement('source');
        const s2 = document.createElement('source');

        this.eventEquals = () => {
          assert.equal(this.sourcesets[0], this.loadstarts[0], 'first loadstart equals first sourceset');
          assert.equal(this.sourcesets[1], '', 'second sourceset is empty string as we can not know source');
        };

        s1.src = sourceOne.src;
        s2.src = sourceTwo.src;

        this.el.one('loadstart', () => {
          a2.fn(this.el, s2);
          window.setTimeout(() => this.el.load(), wait);
        });
        this.el.on('loadstart', done);

        a1.fn(this.el, s1);
      });

      QUnit.test(`${a1.name} -> removeAttribute -> ${a2.name} -> load`, function(assert) {
        const done = assert.async();

        // innerHTML causes an extra sourceset/loadstart since
        // it causes the element to empty itself completely and the
        // gets appended to
        if (browser.IE_VERSION) {
          this.totalSourcesets = 3;
          this.totalLoadstarts = 3;
          this.eventEquals = () => {
            assert.equal(this.sourcesets[0], this.loadstarts[0], 'first loadstart equals first sourceset');
            assert.equal(this.sourcesets[1], '', 'second is empty string as we cannot know the source');
            assert.equal(this.sourcesets[2], '', 'last sourceset is empty string as we can not know source');
          };
        } else {
          this.eventEquals = () => {
            assert.equal(this.sourcesets[0], this.loadstarts[0], 'first loadstart equals first sourceset');
            assert.equal(this.sourcesets[1], '', 'second sourceset is empty string as we can not know source');
          };
        }

        const s1 = document.createElement('source');
        const s2 = document.createElement('source');

        s1.src = sourceOne.src;
        s2.src = sourceTwo.src;

        this.el.one('loadstart', () => {
          this.el.removeAttribute('src');
          window.setTimeout(() => {
            a2.fn(this.el, s2);
            window.setTimeout(() => {
              this.el.load();
              done();
            }, wait);
          }, wait);
        });

        a1.fn(this.el, s1);
      });
    });

    QUnit.test(`${a1.name} -> load`, function(assert) {
      const done = assert.async(2);
      const s1 = document.createElement('source');

      s1.src = sourceOne.src;

      this.el.one('loadstart', () => this.el.load());
      this.el.on('loadstart', done);

      a1.fn(this.el, s1);
    });

    QUnit.test(`load -> ${a1.name}`, function(assert) {
      const done = assert.async();
      const s1 = document.createElement('source');

      this.totalSourcesets = 2;
      this.totalLoadstarts = 1;

      this.eventEquals = () => {
        assert.equal(this.sourcesets[0], '', 'first sourceset is empty strin');
        assert.equal(this.sourcesets[1], this.loadstarts[0], 'second sourceset equals first loadstart');
      };

      s1.src = sourceOne.src;

      this.el.on('loadstart', done);

      this.el.load();
      a1.fn(this.el, s1);
    });
  });

  QUnit.test('load -> load', function(assert) {
    const done = assert.async();

    this.totalSourcesets = 2;
    this.totalLoadstarts = 0;

    this.eventEquals = () => {
      assert.deepEqual(this.sourcesets, ['', ''], 'bodh empty strings');
    };

    this.el.load();

    window.setTimeout(() => {
      this.el.load();
      done();
    }, wait);
  });

  QUnit.module('bad src', getHooks(1));
  QUnit.test('bad src -> good src -> removeAttribute -> append good', function(assert) {
    const done = assert.async(2);

    this.totalSourcesets = 2;
    this.totalLoadstarts = 2;
    this.el.one('error', () => {
      this.el.one('loadstart', () => {
        this.el.removeAttribute('src');

        const s = document.createElement('source');

        s.src = sourceTwo.src;

        this.el.appendChild(s);
      });
      this.el.src = sourceOne.src;
    });

    this.el.on('loadstart', done);

    this.el.src = fakeSource.src;
  });

  QUnit.test('bad src -> bad src -> removeAttribute -> append good', function(assert) {
    const done = assert.async(2);

    this.totalSourcesets = 2;
    this.totalLoadstarts = 2;

    this.el.one('error', () => {
      this.el.one('loadstart', () => {
        this.el.removeAttribute('src');

        const s = document.createElement('source');

        s.src = sourceOne.src;

        this.el.appendChild(s);
      });
      this.el.src = fakeSource.src;
    });

    this.el.on('loadstart', done);

    this.el.src = fakeSource.src;
  });

  QUnit.test('bad src -> removeAttribute after error -> append', function(assert) {
    let done;

    if (supportsErrorRecovery) {
      done = assert.async(2);
      this.totalSourcesets = 2;
      this.totalLoadstarts = 2;
    } else {
      done = assert.async(1);
      this.totalSourcesets = 1;
      this.totalLoadstarts = 1;
    }
    this.el.one('error', () => {
      this.el.removeAttribute('src');
      const s = document.createElement('source');

      s.src = sourceOne.src;

      this.el.appendChild(s);
    });

    this.el.on('loadstart', done);

    this.el.src = fakeSource.src;
  });

  QUnit.test('bad src -> removeAttribute before error -> append', function(assert) {
    let done;

    if (supportsErrorRecovery) {
      done = assert.async(2);
      this.totalSourcesets = 2;
      this.totalLoadstarts = 2;
    } else {
      done = assert.async(1);
      this.totalSourcesets = 1;
      this.totalLoadstarts = 1;
    }
    this.el.one('loadstart', () => {
      this.el.removeAttribute('src');
      const s = document.createElement('source');

      s.src = sourceOne.src;

      this.el.one('error', () => {
        this.el.appendChild(s);
      });
    });

    this.el.on('loadstart', done);

    this.el.src = fakeSource.src;
  });

  QUnit.test('bad src -> append on error', function(assert) {
    const done = assert.async();

    this.totalSourcesets = 1;
    this.totalLoadstarts = 1;
    this.el.one('error', () => {
      const s = document.createElement('source');

      s.src = sourceOne.src;

      this.el.appendChild(s);
    });

    this.el.on('loadstart', done);

    this.el.src = fakeSource.src;
  });

  QUnit.test('bad src -> append before error', function(assert) {
    const done = assert.async();

    this.totalSourcesets = 1;
    this.totalLoadstarts = 1;
    this.el.one('loadstart', () => {
      const s = document.createElement('source');

      s.src = sourceOne.src;

      this.el.appendChild(s);
    });

    this.el.on('loadstart', done);

    this.el.src = fakeSource.src;
  });

  QUnit.module('parallel', getHooks(1));

  singleTypes.forEach((s1) => {
    singleTypes.forEach((s2) => {
      QUnit.test(`${s1.name} + ${s2.name}`, function(assert) {
        const done = assert.async();

        this.totalSourcesets = 2;
        this.totalLoadstarts = 1;

        this.eventEquals = () => {
          assert.equal(this.sourcesets[0], sourceOne.src, 'first sourceset is as expected');
          assert.equal(this.loadstarts[0], this.sourcesets[1], 'loadstart is second sourceset');
        };

        this.el.on('loadstart', done);

        s1.fn(this.el, sourceOne.src);
        s2.fn(this.el, sourceTwo.src);
      });

      QUnit.test(`${s1.name} + ${s2.name} + load`, function(assert) {
        const done = assert.async();

        this.totalSourcesets = 3;
        this.totalLoadstarts = 1;

        this.eventEquals = () => {
          assert.equal(this.sourcesets[0], sourceOne.src, 'first sourceset is as expected');
          assert.equal(this.loadstarts[0], this.sourcesets[1], 'loadstart is second sourceset');
          assert.equal(this.loadstarts[0], this.sourcesets[2], 'loadstart is third sourceset');
        };

        this.el.on('loadstart', done);

        s1.fn(this.el, sourceOne.src);
        s2.fn(this.el, sourceTwo.src);
        this.el.load();
      });

      QUnit.test(`${s1.name} + removeAttribute + ${s2.name}`, function(assert) {
        const done = assert.async();

        this.el.on('loadstart', done);

        this.totalSourcesets = 2;
        this.totalLoadstarts = 1;

        this.eventEquals = () => {
          assert.equal(this.sourcesets[0], sourceOne.src, 'first sourceset is as expected');
          assert.equal(this.sourcesets[1], sourceTwo.src, 'second sourceset is as expected');
          assert.equal(this.loadstarts[0], this.sourcesets[1], 'loadstart is second sourceset');
        };

        s1.fn(this.el, sourceOne.src);
        this.el.removeAttribute('src');
        s2.fn(this.el, sourceTwo.src);
      });

      QUnit.test(`${s1.name} + removeAttribute + ${s2.name} + load`, function(assert) {
        const done = assert.async();

        this.el.on('loadstart', done);

        this.totalSourcesets = 3;
        this.totalLoadstarts = 1;

        this.eventEquals = () => {
          assert.equal(this.sourcesets[0], sourceOne.src, 'first sourceset is as expected');
          assert.equal(this.loadstarts[0], this.sourcesets[1], 'loadstart is second sourceset');
          assert.equal(this.loadstarts[0], this.sourcesets[2], 'loadstart is third sourceset');
        };

        s1.fn(this.el, sourceOne.src);
        this.el.removeAttribute('src');
        s2.fn(this.el, sourceTwo.src);
        this.el.load();
      });
    });

    QUnit.test(`${s1.name} + load`, function(assert) {
      const done = assert.async();

      this.el.on('loadstart', done);

      this.totalSourcesets = 2;
      this.totalLoadstarts = 1;

      this.eventEquals = () => {
        assert.equal(this.sourcesets[0], sourceOne.src, 'first sourceset is as expected');
        assert.equal(this.sourcesets[1], sourceOne.src, 'second sourceset is as expected');
        assert.equal(this.loadstarts[0], this.sourcesets[0], 'loadstart is second sourceset');
      };

      s1.fn(this.el, sourceOne.src);
      this.el.load();
    });

    QUnit.test(`${s1.name} + removeAttribute + load`, function(assert) {
      this.totalSourcesets = 2;
      this.totalLoadstarts = 0;

      this.eventEquals = () => {
        assert.equal(this.sourcesets[0], sourceOne.src, 'as expected');
        assert.equal(this.sourcesets[1], '', 'as expected');
      };
      s1.fn(this.el, sourceOne.src);
      this.el.removeAttribute('src');
      this.el.load();
    });
  });

  appendTypes.forEach((a1) => {
    singleTypes.forEach((s) => {
      QUnit.test(`${s.name} + ${a1.name}`, function(assert) {
        const done = assert.async();

        this.el.on('loadstart', done);

        const source = document.createElement('source');

        source.src = sourceTwo.src;

        s.fn(this.el, sourceOne.src);
        a1.fn(this.el, source);
      });

      QUnit.test(`${a1.name} + ${s.name}`, function(assert) {
        const done = assert.async();

        this.totalSourcesets = 2;
        this.totalLoadstarts = 1;

        this.eventEquals = () => {
          assert.equal(this.sourcesets[0], sourceOne.src, 'first sourceset is first source');
          assert.equal(this.sourcesets[1], this.loadstarts[0], 'second sourceset is loadstart');
        };
        this.el.on('loadstart', done);

        const source = document.createElement('source');

        source.src = sourceOne.src;

        a1.fn(this.el, source);
        s.fn(this.el, sourceTwo.src);

      });

      QUnit.test(`${s.name} + ${a1.name} + load`, function(assert) {
        const done = assert.async();
        const s2 = document.createElement('source');

        this.totalSourcesets = 2;

        this.eventEquals = () => {
          assert.equal(this.sourcesets[0], this.loadstarts[0], 'first sourceset is first loadstart');
          assert.equal(this.sourcesets[1], this.loadstarts[0], 'second sourceset is first loadstart');
        };
        s2.src = sourceTwo.src;

        this.el.on('loadstart', done);

        s.fn(this.el, sourceOne.src);
        a1.fn(this.el, s2);
        this.el.load();
      });

      QUnit.test(`${s.name} + removeAttribute + ${a1.name}`, function(assert) {
        const done = assert.async();
        const s2 = document.createElement('source');

        this.totalSourcesets = 2;
        this.eventEquals = () => {
          assert.equal(this.sourcesets[0], sourceOne.src, 'sourceset 1 = source one');
          assert.equal(this.sourcesets[1], this.loadstarts[0], 'sourceset 2 = loadstart 1');
        };
        s2.src = sourceTwo.src;

        this.el.on('loadstart', done);

        s.fn(this.el, sourceOne.src);
        this.el.removeAttribute('src');
        a1.fn(this.el, s2);
      });

      QUnit.test(`${s.name} + removeAttribute + ${a1.name} + load`, function(assert) {
        const done = assert.async();
        const s2 = document.createElement('source');

        s2.src = sourceTwo.src;

        this.el.on('loadstart', done);

        this.totalSourcesets = 3;

        this.eventEquals = () => {
          assert.equal(this.sourcesets[0], sourceOne.src, 'sourceset 1 = source one');
          assert.equal(this.sourcesets[1], this.loadstarts[0], 'sourceset 2 = loadstart 1');
          assert.equal(this.sourcesets[1], this.loadstarts[0], 'sourceset 3 = loadstart 1');
        };

        s.fn(this.el, sourceOne.src);
        this.el.removeAttribute('src');
        a1.fn(this.el, s2);
        this.el.load();
      });
    });

    appendTypes.forEach((a2) => {
      QUnit.test(`${a1.name} + ${a2.name}`, function(assert) {
        const done = assert.async();

        const s1 = document.createElement('source');
        const s2 = document.createElement('source');

        s1.src = sourceOne.src;
        s2.src = sourceTwo.src;

        this.el.on('loadstart', done);

        a1.fn(this.el, s1);
        a2.fn(this.el, s2);
      });

      QUnit.test(`${a1.name} + ${a2.name} + load`, function(assert) {
        const done = assert.async();

        const s1 = document.createElement('source');
        const s2 = document.createElement('source');

        s1.src = sourceOne.src;
        s2.src = sourceTwo.src;

        this.totalSourcesets = 2;

        this.eventEquals = () => {
          assert.equal(this.sourcesets[0], sourceOne.src, 'sourceset 1 = source on');
          assert.equal(this.sourcesets[1], '', 'sourceset 2 = blank string');
          assert.ok(this.loadstarts[0], 'loadstart 1 = some source');
        };

        this.el.on('loadstart', done);

        a1.fn(this.el, s1);
        a2.fn(this.el, s2);
        this.el.load();
      });

      QUnit.test(`${a1.name} + removeAttribute + ${a2.name}`, function(assert) {
        const done = assert.async();

        const s1 = document.createElement('source');
        const s2 = document.createElement('source');

        s1.src = sourceOne.src;
        s2.src = sourceTwo.src;

        this.el.on('loadstart', done);

        a1.fn(this.el, s1);
        this.el.removeAttribute('src');
        a2.fn(this.el, s2);
      });

      QUnit.test(`${a1.name} + removeAttribute + ${a2.name} + load`, function(assert) {
        const done = assert.async();

        const s1 = document.createElement('source');
        const s2 = document.createElement('source');

        this.totalSourcesets = 2;
        this.eventEquals = () => {
          assert.equal(this.sourcesets[0], sourceOne.src, 'sourceset 1 = source on');
          assert.equal(this.sourcesets[1], '', 'sourceset 2 = blank string');
          assert.ok(this.loadstarts[0], 'loadstart 1 = some source');
        };

        s1.src = sourceOne.src;
        s2.src = sourceTwo.src;

        this.el.on('loadstart', done);

        a1.fn(this.el, s1);
        this.el.removeAttribute('src');
        a2.fn(this.el, s2);
        this.el.load();
      });
    });

    QUnit.test(`${a1.name} + load`, function(assert) {
      const done = assert.async();

      const s1 = document.createElement('source');

      this.totalSourcesets = 2;

      this.eventEquals = () => {
        assert.equal(this.sourcesets[0], this.loadstarts[0], 'first loadstart is first sourceset');
        assert.equal(this.sourcesets[1], this.loadstarts[0], 'first loadstart is second sourceset');
      };

      s1.src = sourceOne.src;

      this.el.on('loadstart', done);

      a1.fn(this.el, s1);
      this.el.load();
    });

    QUnit.test(`load + ${a1.name}`, function(assert) {
      const done = assert.async();

      this.totalSourcesets = 2;

      this.eventEquals = () => {
        assert.equal(this.sourcesets[0], '', 'blank sourceset');
        assert.equal(this.sourcesets[1], this.loadstarts[0], 'first loadstart is second sourceset');
      };
      const s1 = document.createElement('source');

      s1.src = sourceOne.src;

      this.el.on('loadstart', done);

      this.el.load();
      a1.fn(this.el, s1);
    });
  });

  QUnit.test('load and then load', function(assert) {
    this.totalSourcesets = 2;
    this.totalLoadstarts = 0;

    this.eventEquals = () => {
      assert.deepEqual(this.sourcesets, ['', ''], 'both empty string');
    };
    this.el.load();
    this.el.load();
  });
})));
