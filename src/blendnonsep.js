import {onload2promise} from './utils';
import {KernelRunner} from './blend';

function BlendNonSepModes(gpu, width, height){
    /*
    This is going to be a mix of gpu and cpu bound tasks, because some parts of each mode require access to all
    other parts first (that is why they are non-separable)
     */

    KernelRunner.call(this, gpu, width, height);
    const self = this;

    for(let mode of ['color',
                     'luminosity',
                     'hue',
                     'saturation',]){
        self[mode] = function(lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight){
            return self._runKernelAlphaWrapped(mode, lower, upper, opacity, offsetX, offsetY, sourceWidth, sourceHeight);
        }
    }

    this._saturation = function(lr, lg, lb, ur, ug, ub){
        
        // _setLum(_setSat(l, _sat(u)), _lum(l))
        const lower_src_ = [lr, lg, lb];


        // lum
        const lum_l_right = (lr * 0.299) + (lg * 0.587) + (lb * 0.114);


        //sat(Cb)
        const sat_l = Math.max(Math.max(ur, ug), ub) - Math.min(Math.min(ur, ug), ub);

        //setSat(u, sat_l)
        let min_lic = 0;
        let mid_lic = 1;
        let max_lic = 2;

        if (lower_src_[mid_lic] < lower_src_[min_lic]){
            const tmp_c = min_lic;
            min_lic = mid_lic;
            mid_lic = tmp_c;
        }

        if (lower_src_[max_lic] < lower_src_[mid_lic]) {
            const tmp_c = mid_lic;
            mid_lic = max_lic;
            max_lic = tmp_c
        }

        if (lower_src_[mid_lic] < lower_src_[min_lic]) {
            const tmp_c = min_lic;
            min_lic = mid_lic;
            mid_lic = tmp_c;
        }

        if (lower_src_[max_lic] - lower_src_[min_lic] > 0.0){
            lower_src_[mid_lic] = (((lower_src_[mid_lic] - lower_src_[min_lic]) * sat_l) / (lower_src_[max_lic] - lower_src_[min_lic]));
            lower_src_[max_lic] = sat_l
        }else{
            lower_src_[mid_lic] = 0.0;
            lower_src_[max_lic] = 0.0;
        }

        lower_src_[min_lic] = 0.0;

        const n_lr = lower_src_[0], n_lg = lower_src_[1], n_lb = lower_src_[2];

        // setlum
        const lum_lprior = (n_lr * 0.299) + (n_lg * 0.587) + (n_lb * 0.114);
        const lum_d = lum_l_right - lum_lprior;

        let br = n_lr + lum_d;
        let bg = n_lg + lum_d;
        let bb = n_lb + lum_d;

        const lum_l = (br * 0.299) + (bg * 0.587) + (bb * 0.114);

        const n = Math.min(Math.min(br, bg), bb);
        const x = Math.max(Math.max(br, bg), bb);

        if(n < 0.0){
            br = lum_l + (((br - lum_l) * lum_l) / (lum_l - n));
            bg = lum_l + (((bg - lum_l) * lum_l) / (lum_l - n));
            bb = lum_l + (((bb - lum_l) * lum_l) / (lum_l - n));
        }

        if(x > 1.0){
            br = lum_l + (((br - lum_l) * (1 - lum_l)) / (x - lum_l));
            bg = lum_l + (((bg - lum_l) * (1 - lum_l)) / (x - lum_l));
            bb = lum_l + (((bb - lum_l) * (1 - lum_l)) / (x - lum_l));
        }

        
    };

    this._hue = function(lr, lg, lb, ur, ug, ub) {

        // lum
        const lum_l = (lr * 0.299) + (lg * 0.587) + (lb * 0.114);
        const upper_src_ = [ur, ug, ub];

        //sat(Cb)
        const sat_l = Math.max(Math.max(lr, lg), lb) - Math.min(Math.min(lr, lg), lb);

        //setSat(u, sat_l)
        let min_uic = 0;
        let mid_uic = 1;
        let max_uic = 2;

        if (upper_src_[mid_uic] < upper_src_[min_uic]){
            const tmp_c = min_uic;
            min_uic = mid_uic;
            mid_uic = tmp_c;
        }

        if (upper_src_[max_uic] < upper_src_[mid_uic]) {
            const tmp_c = mid_uic;
            mid_uic = max_uic;
            max_uic = tmp_c;
        }

        if (upper_src_[mid_uic] < upper_src_[min_uic]) {
            const tmp_c = min_uic;
            min_uic = mid_uic;
            mid_uic = tmp_c;
        }

        if (upper_src_[max_uic] - upper_src_[min_uic] > 0.0){
            upper_src_[mid_uic] = (((upper_src_[mid_uic] - upper_src_[min_uic]) * sat_l) / (upper_src_[max_uic] - upper_src_[min_uic]));
            upper_src_[max_uic] = sat_l;
        }else{
            upper_src_[mid_uic] = 0.0;
            upper_src_[max_uic] = 0.0;
        }

        upper_src_[min_uic] = 0.0;

        const n_ur = upper_src_[0], n_ug = upper_src_[1], n_ub = upper_src_[2];

        // setlum

        const lum_uprior = (n_ur * 0.299) + (n_ug * 0.587) + (n_ub * 0.114);
        const lum_d = lum_l - lum_uprior;

        let br = n_ur + lum_d;
        let bg = n_ug + lum_d;
        let bb = n_ub + lum_d;

        const lum_u = (br * 0.299) + (bg * 0.587) + (bb * 0.114);

        const n = Math.min(Math.min(br, bg), bb);
        const x = Math.max(Math.max(br, bg), bb);

        if(n < 0.0){
            br = lum_u + (((br - lum_u) * lum_u) / (lum_u - n));
            bg = lum_u + (((bg - lum_u) * lum_u) / (lum_u - n));
            bb = lum_u + (((bb - lum_u) * lum_u) / (lum_u - n));
        }

        if(x > 1.0){
            br = lum_u + (((br - lum_u) * (1 - lum_u)) / (x - lum_u));
            bg = lum_u + (((bg - lum_u) * (1 - lum_u)) / (x - lum_u));
            bb = lum_u + (((bb - lum_u) * (1 - lum_u)) / (x - lum_u));
        }
    };

    this._luminosity = function(lr, lg, lb, ur, ug, ub) {

        // lum
        const lum_u = (ur * 0.299) + (ug * 0.587) + (ub * 0.114);
        const lum_lprior = (lr * 0.299) + (lg * 0.587) + (lb * 0.114);

        // setlum
        const lum_d = lum_u - lum_lprior;

        let br = lr + lum_d;
        let bg = lg + lum_d;
        let bb = lb + lum_d;

        const lum_l = (br * 0.299) + (bg * 0.587) + (bb * 0.114);

        const n = Math.min(Math.min(br, bg), bb);
        const x = Math.max(Math.max(br, bg), bb);

        if(n < 0.0){
            br = lum_l + (((br - lum_l) * lum_l) / (lum_l - n));
            bg = lum_l + (((bg - lum_l) * lum_l) / (lum_l - n));
            bb = lum_l + (((bb - lum_l) * lum_l) / (lum_l - n));
        }

        if(x > 1.0){
            br = lum_l + (((br - lum_l) * (1 - lum_l)) / (x - lum_l));
            bg = lum_l + (((bg - lum_l) * (1 - lum_l)) / (x - lum_l));
            bb = lum_l + (((bb - lum_l) * (1 - lum_l)) / (x - lum_l));
        }

    };
    
    this._color = function(lr, lg, lb, ur, ug, ub) {

        // lum
        const lum_l = (lr * 0.299) + (lg * 0.587) + (lb * 0.114);
        const lum_uprior = (ur * 0.299) + (ug * 0.587) + (ub * 0.114);

        // setlum
        const lum_d = lum_l - lum_uprior;

        let br = ur + lum_d;
        let bg = ug + lum_d;
        let bb = ub + lum_d;

        const lum_u = (br * 0.299) + (bg * 0.587) + (bb * 0.114);

        const n = Math.min(Math.min(br, bg), bb);
        const x = Math.max(Math.max(br, bg), bb);

        if(n < 0.0){
            br = lum_u + (((br - lum_u) * lum_u) / (lum_u - n));
            bg = lum_u + (((bg - lum_u) * lum_u) / (lum_u - n));
            bb = lum_u + (((bb - lum_u) * lum_u) / (lum_u - n));
        }

        if(x > 1.0){
            br = lum_u + (((br - lum_u) * (1 - lum_u)) / (x - lum_u));
            bg = lum_u + (((bg - lum_u) * (1 - lum_u)) / (x - lum_u));
            bb = lum_u + (((bb - lum_u) * (1 - lum_u)) / (x - lum_u));
        }
    };


}

export {
    BlendNonSepModes
}