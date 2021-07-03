import {cloneCanvas} from './utils';
import {TYPE_LAYER} from "./index";

function KernelRunner(gpu, width, height){
    const self = this;
    self.width = width;
    self.height = height;
    self.gpu = gpu;
    self.kernelCache = {};

    this._runKernel = function(kernelName, final_kernfunc_str, lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight){
        if(!(kernelName in self.kernelCache)){


            self.kernelCache[kernelName] = self.gpu.createKernel(final_kernfunc_str)
                .setGraphical(true).setDynamicOutput(true);
            self.kernelCache[kernelName].setOutput([self.width, self.height]);
        }


        self.kernelCache[kernelName](lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight);
        return cloneCanvas(self.kernelCache[kernelName].canvas);
    };

    this._runKernelNoWrap = function(kernelName, lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight){
        const final_kernfunc_str = self['_' + kernelName].toString();
        return self._runKernel(kernelName, final_kernfunc_str, lower, upper, opacity, offsetX, offsetY, sourceWidth,
            sourceHeight);
    };

    this._runKernelAlphaWrapped = function(kernelName, lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight){

        let blend_code = self['_' + kernelName].toString();
        blend_code = blend_code.substring(blend_code.indexOf("\n") + 1);
        blend_code = blend_code.substring(blend_code.lastIndexOf("\n") + 1, -1 );


        const final_kernfunc_str = self._alpha_comp_shell.toString()
            .replace('// _BLEND_CALCS_REPLACE_', blend_code);
        return self._runKernel(kernelName, final_kernfunc_str, lower, upper, opacity, offsetX, offsetY, sourceWidth,
        sourceHeight);
    };

    this._alpha_comp_shell = function(lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight) {

        // for some unknown reason, cannot unpack image[x][y][z][channel]
        // in a single step, must be done first over xyz and then separately in channel
        const lower_src = lower[this.thread.y][this.thread.x];
        const lr = lower_src[0], lg = lower_src[1], lb = lower_src[2], la = lower_src[3];
        const i = this.thread.x - offsetX, j = this.thread.y - offsetY;

        if (i >= 0 && i < sourceWidth && j >= 0 && j < sourceHeight){

                const upper_src = upper[j][i];
                const ua = upper_src[3] * opacity;
                const ur = upper_src[0], ug = upper_src[1], ub = upper_src[2];

                // T(composite_type(a) + b - mul(a,b))

                const oa = ua + la - (ua * la);

                // blend part
                // ~~~~~
                // DO NOT REMOVE THIS COMMENT -- it assigns br, bg,  and bb
                // _BLEND_CALCS_REPLACE_
                // ~~~~~

                const or = (((1.0 - ua) * la * lr) + ((1.0 - la) * ua * ur) + (la * ua * br)) / oa;
                const og = (((1.0 - ua) * la * lg) + ((1.0 - la) * ua * ug) + (la * ua * bg)) / oa;
                const ob = (((1.0 - ua) * la * lb) + ((1.0 - la) * ua * ub) + (la * ua * bb)) / oa;


                this.color(or, og, ob, oa);

        }else{
            this.color(lr, lg, lb, la);
        }

    };
}


function BlendModes(gpu, width, height){
    KernelRunner.call(this, gpu, width, height);
    const self = this;

    for(let mode of ['normal',
                     'multiply',
                     'screen',
                     'overlay',
                     'darken_only',
                     'lighten_only',
                     'dodge',
                     'burn',
                     'hard_light',
                     'soft_light',
                     'difference',
                     ]){
        self[mode] = function(lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight){
            return self._runKernelAlphaWrapped(mode, lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight);
        }
    }

    this._soft_light = function(lr, lg, lb, ur, ug, ub){
        const br = ((1.0 - lr) * lr * ur) + (lr * (1.0 - (1.0 - lr) * (1.0 - ur)));
        const bg = ((1.0 - lg) * lg * ug) + (lg * (1.0 - (1.0 - lg) * (1.0 - ug)));
        const bb = ((1.0 - lb) * lb * ub) + (lb * (1.0 - (1.0 - lb) * (1.0 - ub)));
    };

    this._lighten_only = function(lr, lg, lb, ur, ug, ub){
        const br = Math.max(lr, ur);
        const bg = Math.max(lg, ug);
        const bb = Math.max(lb, ub);
    };

    this._screen = function(lr, lg, lb, ur, ug, ub){
        const br = 1.0 - ((1.0 - lr) * (1.0 - ur));
        const bg = 1.0 - ((1.0 - lg) * (1.0 - ug));
        const bb = 1.0 - ((1.0 - lb) * (1.0 - ub));
    };

    this._dodge = function(lr, lg, lb, ur, ug, ub){
        const br = Math.min(lr / (1.0 - ur), 1.0);
        const bg = Math.min(lg / (1.0 - ug), 1.0);
        const bb = Math.min(lb / (1.0 - ub), 1.0);
    };

    this._burn = function(lr, lg, lb, ur, ug, ub){
        const br = Math.max(1.0 - ((1.0 - lr) / ur), 0.0);
        const bg = Math.max(1.0 - ((1.0 - lg) / ug), 0.0);
        const bb = Math.max(1.0 - ((1.0 - lb) / ub), 0.0);
    };

    this._addition = function(lr, lg, lb, ur, ug, ub){
        const br = Math.min(lr + ur, 1.0);
        const bg = Math.min(lg + ug, 1.0);
        const bb = Math.min(lb + ub, 1.0);
    };

    this._darken_only = function(lr, lg, lb, ur, ug, ub){
        const br = Math.min(lr, ur);
        const bg = Math.min(lg, ug);
        const bb = Math.min(lb, ub);
    };

    this._multiply = function(lr, lg, lb, ur, ug, ub){
        const br = Math.min(lr * ur, 1.0);
        const bg = Math.min(lg * ug, 1.0);
        const bb = Math.min(lb * ub, 1.0);
    };

    this._hard_light = function(lr, lg, lb, ur, ug, ub){
        const ugtr = ur > 0.5 ? 1.0 : 0.0, ulsr = ur <= 0.5 ? 1.0 : 0.0;
        const br = (ugtr * Math.min(1.0 - ((1.0 - lr) * (1.0 - (ur - 0.5) * 2.0)), 1.0)) + (ulsr * Math.min(lr * (ur * 2.0), 1.0));
        const ugtg = ug > 0.5 ? 1.0 : 0.0, ulsg = ug <= 0.5 ? 1.0 : 0.0;
        const bg = (ugtg * Math.min(1.0 - ((1.0 - lg) * (1.0 - (ug - 0.5) * 2.0)), 1.0)) + (ulsg * Math.min(lg * (ug * 2.0), 1.0));
        const ugtb = ub > 0.5 ? 1.0 : 0.0, ulsb = ub <= 0.5 ? 1.0 : 0.0;
        const bb = (ugtb * Math.min(1.0 - ((1.0 - lb) * (1.0 - (ub - 0.5) * 2.0)), 1.0)) + (ulsb * Math.min(lb * (ub * 2.0), 1.0));
    };

    this._difference = function(lr, lg, lb, ur, ug, ub){
        const br = (lr - ur < 0.0 ? (lr - ur) * -1.0 : lr - ur);
        const bg = (lg - ug < 0.0 ? (lg - ug) * -1.0 : lg - ug);
        const bb = (lb - ub < 0.0 ? (lb - ub) * -1.0 : lb - ub);
    };

    this._subtract = function(lr, lg, lb, ur, ug, ub){
        const br = Math.max(lr - ur, 0.0);
        const bg = Math.max(lg - ug, 0.0);
        const bb = Math.max(lb - ub, 0.0);
    };

    this._grain_extract = function(lr, lg, lb, ur, ug, ub){
        const br = Math.min(Math.max(lr - ur + 0.5, 0.0), 1.0);
        const bg = Math.min(Math.max(lg - ug + 0.5, 0.0), 1.0);
        const bb = Math.min(Math.max(lb - ub + 0.5, 0.0), 1.0);
    };

    this._grain_merge = function(lr, lg, lb, ur, ug, ub){
        const br = Math.min(Math.max(lr - ur - 0.5, 0.0), 1.0);
        const bg = Math.min(Math.max(lg - ug - 0.5, 0.0), 1.0);
        const bb = Math.min(Math.max(lb - ub - 0.5, 0.0), 1.0);
    };

    this._divide = function(lr, lg, lb, ur, ug, ub){
        const br = Math.min((256.0 / 255.0 * lr) / (1.0 / 255.0 + ur), 1.0);
        const bg = Math.min((256.0 / 255.0 * lg) / (1.0 / 255.0 + ug), 1.0);
        const bb = Math.min((256.0 / 255.0 * lb) / (1.0 / 255.0 + ub), 1.0);
    };

    this._overlay = function(lr, lg, lb, ur, ug, ub){

        const ulsr = lr < 0.5 ? 1.0 : 0.0, ugtr = lr >= 0.5 ? 1.0 : 0.0;
        const br = ((ulsr) * (2.0 * lr * ur) +  (ugtr) * (1.0 - (2.0 * (1.0 - lr) * (1.0 - ur))));
        const ulsg = lg < 0.5 ? 1.0 : 0.0, ugtg = lg >= 0.5 ? 1.0 : 0.0;
        const bg = ((ulsg) * (2.0 * lg * ug) +  (ugtg) * (1.0 - (2.0 * (1.0 - lg) * (1.0 - ug))));
        const ulsb = lb < 0.5 ? 1.0 : 0.0, ugtb = lb >= 0.5 ? 1.0 : 0.0;
        const bb = ((ulsb) * (2.0 * lb * ub) +  (ugtb) * (1.0 - (2.0 * (1.0 - lb) * (1.0 - ub))));
    };


}

export {
    KernelRunner,
    BlendModes
}