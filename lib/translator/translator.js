// the latest walker for output the translate css;
// add before an after event hook;

var Walker = require('../walker');
var event = require('../helper/events');
var tree = require('../node');


function Translator(options){
    this.parser = parser;
    this.tokenizer = tokenizer;
}

var _ = Translator.prototype = new Walker();

// event.mixTo(_);

var walk = _.walk;


_.translate = function(ast){
    this.ast = ast; 
    this.walk(ast);
    this.indent = 1;
}

_.walk_stylesheet = function(ast){
    var cssText = '';
    var bodyText = this.walk(ast.list);
    console.log(bodyText.join('\n'))
}


_.walk_ruleset = function(ast){
    var cssTexts = [this.walk(ast.selector)];
    cssTexts.push(this.walk(ast.block));
    return cssTexts.join('');
}

_.walk_selectorlist = function(ast){
    return this.walk(ast.list).join(',\n');
}
_.walk_complexselector = function(ast){
    return ast.string;
}

_.walk_block = function(ast){
    var res = ['{\n'], rulesets = [], self = this;
    // sub ast
    ast.list.forEach(function(sast){
        if(tree.inspect(sast) === 'ruleset') rulesets.push(sast)
        else res.push('\t' + self.walk(sast) + '\n');
    })
    res.push('}\n')
    rulesets.forEach(function(ruleset){
        res.push(self.walk(ruleset));
    })
    var text = res.join('');
    return text;
}
_.walk_componentvalues = function(ast){
    var text = this.walk(ast.list).join(' ');
    return text;
}

_.walk_declaration = function(ast){
    var text = ast.property;
    var value = this.walk(ast.value);
    return text + ': ' + value + ';';
}
// componentValue
_.walk_ident = function(ast){
    return ast.val;
}


_.walk_string = function(ast){
    return '"' + ast.val + '"';
}

_['walk_,'] = function(ast){
    return ',';
}
_['walk_='] = function(ast){
    return '=';
}


_.walk_unknown = function(ast){
    return ast.name;
}

_.walk_cssfunction =  function(ast){
    return ast.name + '('+ this.walk(ast.value) + ')';
}


_.walk_uri = function(ast){
    return 'url(' + ast.val + ')';
}

_.walk_rgba = function(ast){
    return ast.color.css();
}


_.walk_dimension = function(ast){
    var val = ast.val;
    return val.number + (val.unit? val.unit: '');
}

_.walk_variable = function(){
    return ''
}






module.exports = Translator;
