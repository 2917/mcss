var _ = require('./util');
var tree = require('../node');

// Function.prototype.op_accept = function(list){
//     var test = typeof list === 'function' ? list : _.makePredicate(list);
//     var fn = this;
//     return function(left, right){
//         // means invalid 
//         if( !test(tree.inspect(left)) ||
//             !test(tree.inspect(right))){
//             console.log(left, right, tree.inspect(left))
//             throw Error('invalid actors to operation' + right.lineno)
//         } 
//         return fn.apply(this,arguments) 
//     }
// }

// for % sprintf operation
var formats = {
    'd' : function(value){
        return parseInt(value.value, 10).toString(10);
    },
    'f': function(value){
        return parseFloat(value.value, 10).toString(10);
    },
    'x': function(value){
        return parseInt(value.value, 10).toString(16);
    },
    'X': function(value){
        return parseInt(value.value, 10).toString(16).toUpperCase();
    },
    's': function(value){
        return tree.toStr(value)
    }
}



var $ = module.exports = {
    '+': function(left, right){
        var value = left.value + right.value;
        var unit = left.unit || right.unit;
        if(left.type === 'DIMENSION' && right.type === 'DIMENSION'){

            if(left.unit && right.unit && left.unit !== right.unit) _.warn('unmatched unit, forced 2rd unit equal with the 1st one')
            return {type: left.type, value: value, unit: unit}
        }else{

            return {type: left.type, value: tree.toStr(left) + tree.toStr(right)}
        }
    }.__accept(['TEXT DIMENSION STRING', 'TEXT DIMENSION STRING']),

    '-': function(left, right){
        var value = left.value - right.value;
        var unit = left.unit || right.unit;
        if(left.unit && right.unit && left.unit !== right.unit) _.warn('unmatched unit, forced 2rd unit equal with the 1st one')
        return {type: left.type, value: value, unit: unit}
    }.__accept(['DIMENSION', 'DIMENSION']),

    '*': function(left, right){
        var value = left.value * right.value;
        var unit = left.unit || right.unit;
        if(left.unit && right.unit && left.unit !== right.unit) _.warn('unmatched unit, forced 2rd unit equal with the 1st one')
        return {type: left.type, value: value, unit: unit}
    }.__accept(['DIMENSION', 'DIMENSION']),

    '/': function(left, right){
        if(right.value === 0) throw 'Divid by zero' + right.lineno;
        
        var value = left.value / right.value;
        var unit = left.unit || right.unit;

        if(left.unit && right.unit && left.unit !== right.unit) _.warn('unmatched unit, forced 2rd unit equal with the 1st one')

        return {type: left.type, value: value, unit: unit};
    }.__accept(['DIMENSION', 'DIMENSION']),
    // @TODO: sprintf
    '%': function(left, right){
        if(left.type === 'STRING'){ // sprintf
            var values = right.list || [right],
                index = 0;
            left.value = left.value.replace(/\%(x|f|s|d|X)/g, function(all, format){
                var replace = values[index]
                if(!replace) return tree.null();
                return formats[format](replace);
                index++;
            })
            debugger
            return left;
        }else{
            if(right.value === 0) throw 'Divid by zero' + right.lineno;

            var value = left.value % right.value;
            var unit = left.unit || right.unit;

            if(left.unit && right.unit && left.unit !== right.unit) _.warn('unmatched unit, forced 2rd unit equal with the 1st one')

            return {type: left.type, value: value, unit: unit};
        }
    }.__accept(['DIMENSION STRING']),

    'relation': function(left, right, op){
        var bool = {type: 'BOOLEAN'}
        if(left.type !== right.type){
            bool.value = op === '!=';
        }else{
            if(left.value > right.value){
                bool.value = op === '>' || op === '>=' || op === '!=';
            }
            if(left.value < right.value){
                bool.value = op === '<' || op === '<=' || op === '!=';
            }
            if(left.value == right.value){
                bool.value = op === '==' || op === '>=' || op === '<=';
            }
        }
        return bool;
    },

    '&&': function(left, right){
        if(tree.isPrimary(left)){
            var bool = tree.toBoolean(left)
            if(bool === false) return {
                type: 'BOOLEAN',
                value: false
            }
            if(bool === true) return right
        }
    },

    '||': function(left, right){
        if(tree.isPrimary(left)){
            var bool = tree.toBoolean(left)
            if(bool === true) return left;
            if(bool === false) return right;
        }
    }
}