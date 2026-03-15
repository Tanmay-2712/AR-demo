export class OneEuroFilter {
    constructor(freq, mincutoff = 1.0, beta = 0.0, dcutoff = 1.0) {
        this.freq = freq;
        this.mincutoff = mincutoff;
        this.beta = beta;
        this.dcutoff = dcutoff;
        this.x = new LowPassFilter(this._alpha(mincutoff));
        this.dx = new LowPassFilter(this._alpha(dcutoff));
        this.lastTime = null;
    }

    _alpha(cutoff) {
        let te = 1.0 / this.freq;
        let tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / te);
    }

    filter(value, timestamp = null) {
        if (this.lastTime && timestamp) {
            this.freq = 1.0 / ((timestamp - this.lastTime) / 1000);
        }
        this.lastTime = timestamp;

        let dvalue = this.x.hasLast() ? (value - this.x.lastValue()) * this.freq : 0;
        let edvalue = this.dx.filter(dvalue, this._alpha(this.dcutoff));
        let cutoff = this.mincutoff + this.beta * Math.abs(edvalue);
        return this.x.filter(value, this._alpha(cutoff));
    }
}

class LowPassFilter {
    constructor(alpha) {
        this.setAlpha(alpha);
        this.y = null;
        this.s = null;
    }

    setAlpha(alpha) {
        this.alpha = alpha;
    }

    filter(value, alpha) {
        if (alpha) this.setAlpha(alpha);
        if (this.y === null) {
            this.s = value;
        } else {
            this.s = this.alpha * value + (1.0 - this.alpha) * this.s;
        }
        this.y = this.s;
        return this.y;
    }

    lastValue() { return this.y; }
    hasLast() { return this.y !== null; }
}
