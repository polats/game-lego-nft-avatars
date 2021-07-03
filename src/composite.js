import {onload2promise} from './utils';
import {KernelRunner} from './blend';

function CompositeModes(gpu, width, height){
    KernelRunner.call(this, gpu, width, height);
    const self = this;

    for(let mode of ['src_over',
                     'plus',
                     ]){
        self[mode] = function(lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight){
            return self._runKernelAlphaWrapped(mode, lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight);
        };
    }

    for(let mode of ['dst_in',
                     'dst_out',
                     'src_atop',
                     'dst_atop',]){
        self[mode] = function(lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight){
            return self._runKernelNoWrap(mode, lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight);
        };
    }

    this._src_over = function(lr, lg, lb, ur, ug, ub){
        const br = ur;
        const bg = ug;
        const bb = ub;
    };

    this._plus = function(lr, lg, lb, ur, ug, ub){
        const br = Math.min(ur + lr, 1.0);
        const bg = Math.min(ug + lg, 1.0);
        const bb = Math.min(ub + lb, 1.0);
    };


    this._dst_in = function(lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight) {

        // for some unknown reason, cannot unpack image[x][y][z][channel]
        // in a single step, must be done first over xyz and then separately in channel
        const lower_src = lower[this.thread.y][this.thread.x];
        const lr = lower_src[0], lg = lower_src[1], lb = lower_src[2], la = lower_src[3];
        const i = this.thread.x - offsetX, j = this.thread.y - offsetY;

        if (i >= 0 && i < sourceWidth && j >= 0 && j < sourceHeight){

                const upper_src = upper[j][i];
                const ur = upper_src[0], ug = upper_src[1], ub = upper_src[2], ua = upper_src[3] * opacity;

                // blend part
                const oa = la * ua;
                const or = (la * lr * ua) / oa;
                const og = (la * lg * ua) / oa;
                const ob = (la * lb * ua) / oa;

                this.color(or, og, ob, oa);

        }else{
            this.color(lr, lg, lb, la);
        }
    };

    this._dst_out = function(lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight) {

        // for some unknown reason, cannot unpack image[x][y][z][channel]
        // in a single step, must be done first over xyz and then separately in channel
        const lower_src = lower[this.thread.y][this.thread.x];
        const lr = lower_src[0], lg = lower_src[1], lb = lower_src[2], la = lower_src[3];
        const i = this.thread.x - offsetX, j = this.thread.y - offsetY;

        if (i >= 0 && i < sourceWidth && j >= 0 && j < sourceHeight){

                const upper_src = upper[j][i];
                const ur = upper_src[0], ug = upper_src[1], ub = upper_src[2], ua = upper_src[3] * opacity;

                // blend part
                const oa = la * (1.0 - ua);
                const or = (la * lr * (1.0 - ua)) / oa;
                const og = (la * lg * (1.0 - ua)) / oa;
                const ob = (la * lb * (1.0 - ua)) / oa;

                this.color(or, og, ob, oa);

        }else{
            this.color(lr, lg, lb, la);
        }
    };



    this._src_atop = function(lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight) {

        // for some unknown reason, cannot unpack image[x][y][z][channel]
        // in a single step, must be done first over xyz and then separately in channel
        const lower_src = lower[this.thread.y][this.thread.x];
        const lr = lower_src[0], lg = lower_src[1], lb = lower_src[2], la = lower_src[3];
        const i = this.thread.x - offsetX, j = this.thread.y - offsetY;

        if (i >= 0 && i < sourceWidth && j >= 0 && j < sourceHeight){

                const upper_src = upper[j][i];
                const ur = upper_src[0], ug = upper_src[1], ub = upper_src[2], ua = upper_src[3] * opacity;

                // blend part
                const oa = (ua * la) + (la * (1.0 - ua));
                const or = ((ua * ur * la) + (la * lr * (1.0 - ua))) / oa;
                const og = ((ua * ug * la) + (la * lg * (1.0 - ua))) / oa;
                const ob = ((ua * ub * la) + (la * lb * (1.0 - ua))) / oa;

                this.color(or, og, ob, oa);

        }else{
            this.color(lr, lg, lb, la);
        }
    };

    this._dst_atop = function(lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight) {

        // for some unknown reason, cannot unpack image[x][y][z][channel]
        // in a single step, must be done first over xyz and then separately in channel
        const lower_src = lower[this.thread.y][this.thread.x];
        const lr = lower_src[0], lg = lower_src[1], lb = lower_src[2], la = lower_src[3];
        const i = this.thread.x - offsetX, j = this.thread.y - offsetY;

        if (i >= 0 && i < sourceWidth && j >= 0 && j < sourceHeight){

                const upper_src = upper[j][i];
                const ur = upper_src[0], ug = upper_src[1], ub = upper_src[2], ua = upper_src[3] * opacity;

                // blend part
                const oa = (ua * (1.0 - la)) + (la * ua);
                const or = ((ua * ur * (1.0 - la)) + (la * lr * ua)) / oa;
                const og = ((ua * ug * (1.0 - la)) + (la * lg * ua)) / oa;
                const ob = ((ua * ub * (1.0 - la)) + (la * lb * ua)) / oa;

                this.color(or, og, ob, oa);

        }else{
            this.color(lr, lg, lb, la);
        }
    };


}

export {
    CompositeModes
}