var Walker = require('../walker');
var tree = require('../node');
var symtab = require('../symtab');
var state = require('../helper/state');

function Interpreter(options){};

var _ = Interpreter.prototype = new Walker();


state.mixTo(_);

/**
 * start interpret the ast build from parser
 * all scope,space,selector-combine ... will operated in this step
 *
 * @param  {Node} ast [description]
 * @return {}     [description]
 */
_.interpret = function(ast){
    this.ast = ast;
    this.scope = new symtab.Scope();
    // 相当于函数调用栈
    this.istack = [];
    this.rulesets = [];
    this.indent = 0;
    var res = this.walk(ast);
    return res;
}

/**
 * walk the root stylesheet ast
 * 
 * @param  {[type]} ast [description]
 * @return {[type]}     [description]
 */
_.walk_stylesheet = function(ast){
    ast.scope = this.scope;
    var plist  = ast.list, item;
    ast.list = [];

    for(ast.index = 0; !!plist[ast.index] ; ast.index++){
        if(item = this.walk(plist[ast.index])){
            if(Array.isArray(item)){
                ast.list = ast.list.concat(item);
            }
            ast.list.push(item);
        }
    }
    return ast;
}

// @TODO: multi ruleset
_.walk_ruleset = function(ast, options){
    var prevLength = ast.selector.len();
    var symbols = options.symbols;
    var selector = this.concatSelector(this.walk(ast.selector));
    if((len = selector.len()) > prevLength){
        var ruleset;
        for(var i = 0; i< len; i++){
            var ruleset = new Rule()
        }
    }
    for(var i in symbols)
    this.down(ast);
    this.indent++;
    ast.block = this.walk(ast.block);
    this.up(ast);
    this.indent--;
    if(this.indent) {}
    return ast;
}

// _.walk_mixin = function(ast){
//     this.define(ast.name, ast);
// }
_.walk_assign = function(ast){
    if(ast.override || !this.resolve(ast.name)){
        this.define(ast.name, ast.value);
    }
    return ast.value;
}

_.walk_selectorlist = function(ast){
    var list = ast.list,len;
    if(list.length === 1){
        this.enter('ACCEPT_LIST');
    }
    list = this.walk(list);

    // 
    if((len = list.length > 1) && this.state('ACCEPT_LIST')){
        var curRuleset = this.rulesets[this.rulesets.length - 1];
        for(var i = 0; i< len; i++){
            var ruleset = new tree.RuleSet(list[i], tree.cloneNode())
        }
    }
    this.leave('ACCEPT_LIST');
    return ast;
}


_.walk_complexselector = function(ast){
    var interpolations = ast.interpolations,
        i, len = interpolations.length
    for(i = 0 ;i< len; i++){
        var value = this.walk(interpolations[i]);
        if(value.type === 'valueslist'){

        }
        switch(value.type){
            case 'valueslist':
            default:
                return 

        }
    }
}


_.walk_string = function(ast){
    var self = this, symbol;
    ast.value = ast.value.replace(/#\{(\w+)}/g, function(all, name){
        if(symbol = this.resolve(name)){
            return self.toStr(symbol)
        }else{
            throw Error('not defined String interpolation')
        }
    })
    return ast;
}

_.walk_text = function(){

}


_.walk_operator = function(ast){
}

_.toStr = function(ast){
    switch(ast.type){
        case 'TEXT':
        case 'BOOLEAN':
        case 'NULL':
            return ll.value
        case 'DIMENSION':
            return ll.value + ll.unit? ll.unit : '';
        case 'STRING':
            return this.walk(ast);
        default: 
            return ll.value;
    } 
}

// *
//  * if the ast.value<ConponentValues> is contains a mixin type value
//  * will define it as a mixin, this does well if you want to pass a mixin to param
//  * 
//  * @param  {Variable Node} ast the variable node build in parser step
//  * @return {[type]}     null  (in mermory only, but not outport to css)
 
// _.walk_variable = function(ast){
//     this.walk(ast.value);
//     this.define(ast.name, ast);
// }

_.walk_func = function(){

}

_.walk_include = function(ast){
    var mixin = this.walk(ast.name), 
        res, iscope, params;
    if(!mixin) this.error('no ' + ast.name + ' defined');
    this.expect(mixin, 'mixin')

    iscope = new symtab.Scope();
    params = this.walk(ast.params);

    this.push(iscope);
    var list = []
    for(var i = 0 ; i < params.length; i++){
        var formalName = (mixin.formalParams[i] && mixin.formalParams[i].name),def;
        if(!params[i]){
            continue;
        }
        if(i !== 0){
            list.push({type:','});
        }
        list = list.concat(params[i].list);
        // component values   ||  mixin
        if(formalName){
            this.define(formalName, new tree.Variable(formalName, params[i]))
        }
    }
    this.define('arguments', new tree.Variable('arguments', 
            new tree.ComponentValues(list)
        ))
    // console.log(this.resolve('arguments'), ast.name)
    var block = tree.cloneNode(mixin.block);
    ast = this.walk(block);
    this.pop()
    return ast;
}

/**
 * struct 结构
 * 
 * @param  {[type]} ast [description]
 * @return {[type]}     [description]
 */
_.walk_module = function(ast){
    this.walk(ast.block);
}

// /**
//  * -> 读取模块内信息
//  * @return {[type]} [description]
//  */
// _.walk_pointer = function(ast){
//     var module = this.resolve(ast.name);
//     if(!module) this.error('undefined module: "'+ast.name+'"')
//     this.expect(module, 'module')
//     var scope = module.scope;
//     var node = scope.resolve(ast.key);
//     if(!node) this.error('not "' + ast.key +'" in module:"'+ast.name+'"')
//     return node;
// }



_.walk_componentvalues = function(ast){
    var self = this;
    var list = [], tmp;
    ast.list.forEach(function(item){
        if(tmp = self.walk(item)){
            var type = self._inspect(tmp);
            if(type === 'variable'){
                list = list.concat(tmp.value.list)
            }else{
                list.push(tmp);
            }
        } 
        // 如果什么都没返回则装如原数据
        else list.push(item)
    })
    ast.list = list;
    return ast;
}

_.walk_ident = function(ast){
    var symbol = this.resolve(ast.val);
    if(symbol){
        return symbol;
    }
    else return ast;
}


_.walk_dimension = function(){

}

_.walk_extend = function(ast){

}

_.walk_import = function(ast){
    
}

_.walk_block = function(ast){
    var list = ast.list;
    var res = [], r;
    for(var i = 0, len = list.length; i < list.length ; i++){
        if(list[i] && (r = this.walk(list[i]))){
            if(Array.isArray(r) || tree.inspect(r) === 'block'){
                res = res.concat(r.list || r);
            }else{
                res.push(r);
            }
        }
    }
    ast.list = res;
    return ast;
}



_.walk_declaration = function(ast){
    this.walk(ast.value);
    return ast;
}



// util function
// ===========================


// lexel scope down
_.down = function(ruleset){
    if(ruleset) this.rulesets.push(ruleset);
    this.scope = new symtab.Scope(this.scope);
}

// lexel scope up
_.up = function(ruleset){
    if(ruleset) this.rulesets.pop();
    this.scope = this.scope.getOuterScope();
}
_.concatSelector = function(selectorList){
    var ss = this.rulesets;
    if(!ss.length) return selectorList;

    var parentList = ss[ss.length - 1].selector,
        slist = selectorList.list,
        plist = parentList.list,
        slen = slist.length, 
        plen = plist.length,
        sstring, pstring, rstring,
        s, p, res;
    var res = new tree.SelectorList();
    for(p = 0; p < plen; p ++){
        pstring = plist[p].string;
        for(s = 0; s < slen; s ++) {
            sstring = slist[s].string;
            if(~sstring.indexOf('&')){
                rstring = sstring.replace(/&/g, pstring)
            }else{
                rstring = pstring + ' ' + sstring;
            }
            res.list.push(new tree.ComplexSelector(rstring));
        }
    }
    return res
}


// push function scope
_.push = function(scope){
    this.istack.push(scope);
}

// push function scope
_.pop = function(){
    this.istack.pop()
}

_.peek = function(){
    var len;
    if(len = this.istack.length) return this.istack[len - 1];
}

_.define = function(id, symbol){
    var scope;
    if(scope = this.peek()){
        scope.define(id, symbol);
    }else{
        this.scope.define(id, symbol)
    }
}

_.resolve = function(id){
    var scope, symbol;
    if((scope = this.peek()) && (symbol =  scope.resolve(id))){
        // console.log(scope, symbol)
        return symbol;
    }
    return this.scope.resolve(id);
}

_.expect = function(ast, type){
    if(!(this._inspect(ast) === type)){
        throw Error('interpreter error! expect node: "'+ type +'" got: "' + this._inspect(ast) + '"')
    }
}

















module.exports = Interpreter;

