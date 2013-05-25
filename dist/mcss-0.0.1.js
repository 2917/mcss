var mcss;
(function (modules) {
    var cache = {}, require = function (id) {
            var module = cache[id];
            if (!module) {
                module = cache[id] = {};
                var exports = module.exports = {};
                modules[id].call(exports, require, module, exports, window);
            }
            return module.exports;
        };
    mcss = require('0');
}({
    '0': function (require, module, exports, global) {
        var tokenizer = require('1');
        var parser = require('4');
        var translator = require('a');
        var util = require('2');
        var interpreter = require('d');
        exports.tokenizer = tokenizer;
        exports.parser = parser;
        exports.util = util;
        exports.translator = translator;
        exports.interpreter = interpreter;
        exports.parse = function (text, options, callback) {
            parser.parse(text, options, function (error, ast) {
                ast = interpreter.interpret(ast, options);
                callback(null, translator.translate(ast, options));
            });
        };
    },
    '1': function (require, module, exports, global) {
        var util = require('2');
        var tree = require('3');
        var slice = [].slice;
        var $ = function () {
                var table = {};
                return function (name, pattern) {
                    if (!pattern) {
                        if (/^[a-zA-Z]+$/.test(name)) {
                            return table[name];
                        }
                        pattern = name;
                        name = null;
                    }
                    if (typeof pattern !== 'string') {
                        pattern = String(pattern).slice(1, -1);
                    }
                    pattern = pattern.replace(/\{(\w+)}/g, function (all, name) {
                        var p = table[name];
                        if (!p)
                            throw Error('no register pattern "' + name + '" before');
                        var pstart = p.charAt(0), pend = p.charAt(p.length - 1);
                        if (!(pstart === '[' && pend === ']') && !(pstart === '(' && pend === ')')) {
                            p = '(?:' + p + ')';
                        }
                        return p;
                    });
                    if (name)
                        table[name] = pattern;
                    return new RegExp(pattern);
                };
            }();
        var toAssert = function (str) {
            var arr = typeof str == 'string' ? str.split(/\s+/) : str, regexp = new RegExp('^(?:' + arr.join('|') + ')$');
            return function (word) {
                return regexp.test(word);
            };
        };
        var toAssert2 = util.makePredicate;
        function createToken(type, value, lineno) {
            var token = typeof type === 'object' ? type : {
                    type: type,
                    value: value
                };
            token.lineno = lineno;
            return token;
        }
        exports.tokenize = function (input, options) {
            return new Tokenizer(options).tokenize(input);
        };
        exports.Tokenizer = Tokenizer;
        exports.$ = $;
        exports.createToken = createToken;
        var isUnit = toAssert2('% em ex ch rem vw vh vmin vmax cm mm in pt pc px deg grad rad turn s ms Hz kHz dpi dpcm dppx');
        var isPseudoClassWithParen = toAssert2('current local-link nth-child nth-last-child nth-of-type nth-last-of-type nth-match nth-last-match column nth-column nth-last-column lang matches not', true);
        var $rules = [];
        var $links = {};
        var addRules = function (rules) {
            $rules = $rules.concat(rules);
            var rule, reg, state, link, retain;
            for (var i = 0; i < $rules.length; i++) {
                rule = $rules[i];
                reg = typeof rule.regexp !== 'string' ? String(rule.regexp).slice(1, -1) : rule.regexp;
                if (!~reg.indexOf('^(?')) {
                    rule.regexp = new RegExp('^(?:' + reg + ')');
                }
                state = rule.state || 'init';
                link = $links[state] || ($links[state] = []);
                link.push(i);
            }
            return this;
        };
        $('nl', /\r\n|[\r\f\n]/);
        $('w', /[ \t\r\n\f]/);
        $('d', /[0-9]/);
        $('nmchar', /[-a-z0-9\u00A1-\uFFFF]/);
        addRules([
            {
                regexp: /$/,
                action: function () {
                    return 'EOF';
                }
            },
            {
                regexp: /\/\*([^\x00]+?)\*\/|\/\/([^\n\r$]*)/,
                action: function (yytext, mcomment, scomment) {
                    var isSingle = mcomment === undefined;
                    if (this.options.comment) {
                        this.options.comment({
                            type: isSingle ? 'singleline' : 'multiline',
                            content: isSingle ? scomment : mcomment
                        });
                    }
                }
            },
            {
                reg: /@css{w}*{/,
                action: function (yytext) {
                }
            },
            {
                regexp: /@(-?[_A-Za-z][-_\w]*)/,
                action: function (yytext, value) {
                    this.yyval = value;
                    return 'AT_KEYWORD';
                }
            },
            {
                regexp: /\$(-?[_A-Za-z][-_\w]*)/,
                action: function (yytext, value) {
                    this.yyval = yytext;
                    return 'VAR';
                }
            },
            {
                regexp: $(/url{w}*\((['"]?)([^\r\n\f]*?)\1{w}*\)/),
                action: function (yytext, quote, url) {
                    this.yyval = url;
                    return 'URL';
                }
            },
            {
                regexp: $(/(?:-?[_A-Za-z][-_\w]*)(?={w}*\()/),
                action: function (yytext) {
                    this.yyval = yytext;
                    return 'FUNCTION';
                }
            },
            {
                regexp: /(?:-?[_A-Za-z][-_\w]*)/,
                action: function (yytext) {
                    if (yytext === 'false' || yytext === 'true') {
                        this.yyval = yytext === 'false' ? false : true;
                        return 'BOOLEAN';
                    }
                    if (yytext === 'null')
                        return 'NULL';
                    this.yyval = yytext;
                    return 'TEXT';
                }
            },
            {
                regexp: $(/!{w}*important/),
                action: function (yytext) {
                    return 'IMPORTANT';
                }
            },
            {
                regexp: $(/(-?(?:{d}*\.{d}+|{d}+))(\w*|%)?/),
                action: function (yytext, value, unit) {
                    if (unit && !isUnit(unit)) {
                        this.error('Unexcept unit: "' + unit + '"');
                    }
                    return {
                        type: 'DIMENSION',
                        value: parseInt(value),
                        unit: unit
                    };
                }
            },
            {
                regexp: $(':([-_a-zA-Z]{nmchar}*)' + '(?:\\(' + '([^\\(\\)]*' + '|(?:' + '\\([^\\)]+\\)' + ')+)' + '\\))'),
                action: function (yytext, value) {
                    if (~yytext.indexOf('(') && !isPseudoClassWithParen(value)) {
                        return false;
                    }
                    this.yyval = yytext;
                    return 'PSEUDO_CLASS';
                }
            },
            {
                regexp: $('::({nmchar}+)'),
                action: function (yytext) {
                    this.yyval = yytext;
                    return 'PSEUDO_ELEMENT';
                }
            },
            {
                regexp: $('\\[\\s*(?:{nmchar}+)(?:([*^$|~!]?=)[\'"]?(?:[^\'"\\[]+)[\'"]?)?\\s*\\]'),
                action: function (yytext) {
                    this.yyval = yytext;
                    return 'ATTRIBUTE';
                }
            },
            {
                regexp: $(/#({nmchar}+)/),
                action: function (yytext, value) {
                    this.yyval = yytext;
                    return 'HASH';
                }
            },
            {
                regexp: $(/\.({nmchar}+)/),
                action: function (yytext) {
                    this.yyval = yytext;
                    return 'CLASS';
                }
            },
            {
                regexp: /(['"])([^\r\n\f]*?)\1/,
                action: function (yytext, quote, value) {
                    this.yyval = value || '';
                    return 'RAW_STRING';
                }
            },
            {
                regexp: $(/{w}*([\{};,><]|&&|\|\||[\*\$\^~\|>=<!?]?=|\.\.\.){w}*/),
                action: function (yytext, punctuator) {
                    return punctuator;
                }
            },
            {
                regexp: $('WS', /{w}+/),
                action: function () {
                    return 'WS';
                }
            },
            {
                regexp: /(#\{|:|::|[#()\[\]&\.]|[%\-+*\/])/,
                action: function (yytext, punctuator) {
                    return punctuator;
                }
            }
        ]);
        function Tokenizer(options) {
            this.options = options || {};
            this.options.ignoreComment = true;
        }
        Tokenizer.prototype = {
            constructor: Tokenizer,
            tokenize: function (input) {
                this.input = input;
                this.remained = this.input;
                this.length = this.input.length;
                this.lineno = 1;
                this.states = ['init'];
                this.state = 'init';
                return this.pump();
            },
            lex: function () {
                var token = this.next();
                if (typeof token !== 'undefined') {
                    return token;
                } else {
                    return this.lex();
                }
            },
            pump: function () {
                var tokens = [], t;
                var i = 0;
                while (t = this.lex()) {
                    i++;
                    tokens.push(t);
                    if (t.type == 'EOF')
                        break;
                }
                return tokens;
            },
            next: function () {
                var tmp, action, rule, tokenType, lines, state = this.state, rules = $rules, link = $links[state];
                if (!link)
                    throw Error('no state: ' + state + ' defined');
                this.yyval = null;
                var len = link.length;
                for (var i = 0; i < len; i++) {
                    var rule = $rules[link[i]];
                    tmp = this.remained.match(rule.regexp);
                    if (tmp) {
                        action = rule.action;
                        tokenType = action.apply(this, tmp);
                        if (tokenType === false) {
                            continue;
                        } else
                            break;
                    }
                }
                if (tmp) {
                    lines = tmp[0].match(/(?:\r\n|[\n\r\f]).*/g);
                    if (lines)
                        this.lineno += lines.length;
                    this.remained = this.remained.slice(tmp[0].length);
                    if (tokenType)
                        return createToken(tokenType, this.yyval, this.lineno);
                } else {
                    this.error('Unrecognized');
                }
            },
            pushState: function (condition) {
                this.states.push(condition);
                this.state = condition;
            },
            popState: function () {
                this.states.pop();
                this.state = this.states[this.states.length - 1];
            },
            error: function (message, options) {
                var message = this._traceError(message);
                var error = new Error(message || 'Lexical error');
                throw error;
            },
            _traceError: function (message) {
                var matchLength = this.length - this.remained.length;
                var offset = matchLength - 10;
                if (offset < 0)
                    offset = 0;
                var pointer = matchLength - offset;
                var posMessage = this.input.slice(offset, offset + 20);
                return 'Error on line ' + (this.lineno + 1) + ' ' + (message || '. Unrecognized input.') + '\n' + (offset === 0 ? '' : '...') + posMessage + '...\n' + new Array(pointer + (offset === 0 ? 0 : 3)).join(' ') + new Array(10).join('^');
            }
        };
        console.log($(/\.({nmchar}+)/));
    },
    '2': function (require, module, exports, global) {
        var _ = {};
        _.debugger = 1;
        _.makePredicate = function (words, prefix) {
            if (typeof words === 'string') {
                words = words.split(' ');
            }
            var f = '', cats = [];
            out:
                for (var i = 0; i < words.length; ++i) {
                    for (var j = 0; j < cats.length; ++j)
                        if (cats[j][0].length == words[i].length) {
                            cats[j].push(words[i]);
                            continue out;
                        }
                    cats.push([words[i]]);
                }
            function compareTo(arr) {
                if (arr.length == 1)
                    return f += 'return str === \'' + arr[0] + '\';';
                f += 'switch(str){';
                for (var i = 0; i < arr.length; ++i)
                    f += 'case \'' + arr[i] + '\':';
                f += 'return true}return false;';
            }
            if (cats.length > 3) {
                cats.sort(function (a, b) {
                    return b.length - a.length;
                });
                f += 'var prefix = ' + (prefix ? 'true' : 'false') + ';if(prefix) str = str.replace(/^-(?:\\w+)-/,\'\');switch(str.length){';
                for (var i = 0; i < cats.length; ++i) {
                    var cat = cats[i];
                    f += 'case ' + cat[0].length + ':';
                    compareTo(cat);
                }
                f += '}';
            } else {
                compareTo(words);
            }
            return new Function('str', f);
        };
        _.makePredicate2 = function (words) {
            if (typeof words !== 'string') {
                words = words.join(' ');
            }
            return function (word) {
                return ~words.indexOf(word);
            };
        };
        _.perf = function (fn, times, args) {
            var date = +new Date();
            for (var i = 0; i < times; i++) {
                fn.apply(this, args || []);
            }
            return +new Date() - date;
        };
        _.extend = function (o1, o2, override) {
            for (var j in o2) {
                if (o1[j] == null || override)
                    o1[j] = o2[j];
            }
            return o1;
        };
        _.log = function () {
            if (_.debugger < 3)
                return;
            console.log.apply(console, arguments);
        };
        _.warn = function () {
            if (_.debugger < 2)
                return;
            console.warn.apply(console, arguments);
        };
        _.error = function () {
            if (_.debugger < 1)
                return;
            console.error.apply(console, arguments);
        };
        _.uid = function () {
            var _uid = 1;
            return function () {
                return _uid++;
            };
        }();
        module.exports = _;
    },
    '3': function (require, module, exports, global) {
        var _ = require('2'), splice = [].splice;
        function Stylesheet(list) {
            this.type = 'stylesheet';
            this.list = list || [];
        }
        Stylesheet.prototype.clone = function () {
            var clone = new Stylesheet();
            clone.list = cloneNode(this.list);
            return clone;
        };
        function SelectorList(list) {
            this.type = 'selectorlist';
            this.list = list || [];
        }
        SelectorList.prototype.clone = function () {
            var clone = new SelectorList();
            clone.list = cloneNode(this.list);
            return clone;
        };
        SelectorList.prototype.toString = function () {
        };
        function ComplexSelector(string, interpolations) {
            this.type = 'complexselector';
            this.string = string;
            this.interpolations = interpolations || [];
        }
        ComplexSelector.prototype.clone = function () {
            var clone = new ComplexSelector();
            return clone;
        };
        function RuleSet(selector, block) {
            this.type = 'ruleset';
            this.selector = selector;
            this.block = block;
        }
        RuleSet.prototype.remove = function (ruleset) {
        };
        RuleSet.prototype.clone = function () {
            var clone = new RuleSet(cloneNode(this.selector), cloneNode(this.block));
            return clone;
        };
        function Block(list) {
            this.type = 'block';
            this.list = list || [];
        }
        Block.prototype.clone = function () {
            var clone = new Block(cloneNode(this.list));
            return clone;
        };
        function Call(name, arguments) {
            this.name = name;
            this.arguments = arguments;
        }
        Call.prototype.clone = function () {
            var clone = new Call(this.name, cloneNode(this.arguments));
            return clone;
        };
        function Declaration(property, value, important) {
            this.type = 'declaration';
            this.property = property;
            this.value = value;
            this.important = important || false;
        }
        Declaration.prototype.clone = function (name) {
            var clone = new Declaration(name || this.property, cloneNode(this.value), important);
            return clone;
        };
        function String() {
            this.type = 'string';
        }
        function Values(list) {
            this.type = 'values';
            this.list = list || [];
        }
        Values.prototype.clone = function () {
            var clone = new Values(cloneNode(this.list));
            return clone;
        };
        Values.prototype.flatten = function () {
            var list = this.list, i = list.length, value;
            for (; i--;) {
                value = list[i];
                if (value.type = 'values') {
                    splice.apply(this, [
                        i,
                        1
                    ].concat(value.list));
                }
            }
        };
        function ValuesList(list) {
            this.type = 'valueslist';
            this.list = list || [];
        }
        ValuesList.prototype.clone = function () {
            var clone = new ValuesList(cloneNode(this.list));
            return clone;
        };
        ValuesList.prototype.flatten = function () {
            var list = this.list, i = list.length, values;
            for (; i--;) {
                values = list[i];
                if (values.type = 'valueslist') {
                    splice.apply(this, [
                        i,
                        1
                    ].concat(values.list));
                }
            }
        };
        ValuesList.prototype.first = function () {
            return this.list[0].list[0];
        };
        function Unknown(name) {
            this.type = 'unknown';
            this.name = name;
        }
        Unknown.prototype.clone = function () {
            var clone = new Unknown(this.name);
            return clone;
        };
        function RGBA(channels) {
            this.type = 'rgba';
            if (typeof channels === 'string') {
                var string = channels.charAt(0) === '#' ? channels.slice(1) : channels;
                if (string.length === 6) {
                    channels = [
                        parseInt(string.substr(0, 2), 16),
                        parseInt(string.substr(2, 2), 16),
                        parseInt(string.substr(4, 2), 16),
                        1
                    ];
                } else {
                    var r = string.substr(0, 1);
                    var g = string.substr(1, 1);
                    var b = string.substr(2, 1);
                    channels = [
                        parseInt(r + r, 16),
                        parseInt(g + g, 16),
                        parseInt(b + b, 16),
                        1
                    ];
                }
            }
            this.channels = channels || [];
        }
        RGBA.prototype.clone = function () {
            var clone = new RGBA(cloneNode(this.channels));
            return clone;
        };
        RGBA.prototype.tocss = function () {
            var chs = this.channels;
            if (chs[3] === 1 || chs[3] === undefined) {
                return 'rgb(' + chs[0] + ',' + chs[1] + ',' + chs[2] + ')';
            }
        };
        function Assign(name, value, override) {
            this.type = 'assign';
            this.name = name;
            this.value = value;
            this.override = override === undefined ? true : override;
        }
        Assign.prototype.clone = function (name) {
            var clone = new Variable(this.name, cloneNode(this.value), this.override);
            return clone;
        };
        function Func(name, params, block) {
            this.type = 'func';
            this.name = name;
            this.params = params || [];
            this.block = block;
        }
        Func.prototype.clone = function () {
            var clone = new Func(this.name, this.params, this.block);
            return clone;
        };
        function Param(name, dft, rest) {
            this.type = 'param';
            this.name = name;
            this.default = dft;
            this.rest = rest || false;
        }
        function Include(name, params) {
            this.type = 'include';
            this.name = name;
            this.params = params || [];
        }
        Include.prototype.clone = function () {
            var clone = new Include(this.name, this.params);
            return clone;
        };
        function Extend(selector) {
            this.type = 'extend';
            this.selector = selector;
        }
        Extend.prototype.clone = function () {
            var clone = new Extend(this.selector);
            return clone;
        };
        function Module(name, block) {
            this.type = 'module';
            this.name = name;
            this.block = block;
        }
        Module.prototype.clone = function () {
            var clone = new Module(this.name, cloneNode(this.block));
            return clone;
        };
        function Pointer(name, key) {
            this.type = 'pointer';
            this.name = name;
            this.key = key;
        }
        Pointer.prototype.clone = function () {
            var clone = new Pointer(this.name, this.key);
            return clone;
        };
        function Import(url, media, assign) {
            this.type = 'import';
            this.url = url;
            this.media = media;
            this.assign = assign;
        }
        Import.prototype.clone = function () {
            var clone = new Import(this.url, cloneNode(this.media), this.assign);
            return clone;
        };
        function IfStmt(test, block, alt) {
            this.test = test;
            this.block = block;
            this.alt = alt;
        }
        IfStmt.prototype.clone = function () {
            var clone = new IfStmt(cloneNode(this.test), cloneNode(this.block), cloneNode(this.alt));
            return clone;
        };
        function ForStmt(element, index, list, block) {
            this.element = element;
            this.index = index;
            this.list = list;
            this.block = block;
        }
        ForStmt.prototype.clone = function () {
            var clone = new ForStmt(this.element, this.index, cloneNode(this.list), cloneNode(this.block));
            return clone;
        };
        function ReturnStmt(value) {
            this.value = value;
        }
        ReturnStmt.prototype.clone = function () {
            var clone = new ReturnStmt(cloneNode(this.value));
            return clone;
        };
        function CompoundIdent(list) {
            this.type = 'compoundident';
            this.list = list || [];
        }
        CompoundIdent.prototype.clone = function () {
            var clone = new CompoundIdent(cloneNode(this.list));
            return clone;
        };
        CompoundIdent.prototype.toString = function () {
            return this.list.join('');
        };
        function Dimension(value, unit) {
            this.type = 'dimension';
            this.value = value;
            this.unit = unit;
        }
        Dimension.prototype.clone = function () {
            var clone = new Dimension(this.value, this.unit);
            return clone;
        };
        Dimension.prototype.toString = function () {
            return '' + this.value + (this.unit || '');
        };
        function Operator(type, left, right) {
            this.type = type;
            this.left = left;
            this.right = right;
        }
        Operator.prototype.clone = function (type, left, right) {
            var clone = new Operator(this.type, cloneNode(this.left), cloneNode(this.right));
            return clone;
        };
        Operator.toBoolean = function () {
        };
        Operator.toValue = function () {
        };
        function Range(left, right) {
            this.type = 'range';
            this.left = left;
            this.right = right;
        }
        Range.prototype.clone = function () {
            var clone = new Range(cloneNode(this.left), cloneNode(this.right));
            return clone;
        };
        function CssFunction(name, value) {
            this.name = name;
            this.value = value;
        }
        function Unary(value, reverse) {
            this.value = value;
            this.reverse = !!reverse;
        }
        Unary.prototype.clone = function (value, reverse) {
            var clone = new Unary(value, reverse);
            return clone;
        };
        function Call(name, params) {
            this.params = params;
        }
        Call.prototype.clone = function (name, params) {
            var clone = new Call(name, cloneNode(params));
            return clone;
        };
        exports.Stylesheet = Stylesheet;
        exports.SelectorList = SelectorList;
        exports.ComplexSelector = ComplexSelector;
        exports.RuleSet = RuleSet;
        exports.Block = Block;
        exports.Declaration = Declaration;
        exports.ValuesList = ValuesList;
        exports.Values = Values;
        exports.Unknown = Unknown;
        exports.Func = Func;
        exports.Param = Param;
        exports.Include = Include;
        exports.Extend = Extend;
        exports.IfStmt = IfStmt;
        exports.ForStmt = ForStmt;
        exports.ReturnStmt = ReturnStmt;
        exports.Module = Module;
        exports.Pointer = Pointer;
        exports.Range = Range;
        exports.Import = Import;
        exports.RGBA = RGBA;
        exports.Assign = Assign;
        exports.Call = Call;
        exports.Operator = Operator;
        exports.CompoundIdent = CompoundIdent;
        function FontFace() {
        }
        function Media(name, mediaList) {
            this.name = name;
            this.media = mediaList;
        }
        function Page() {
        }
        function Charset() {
        }
        function NameSpace() {
        }
        exports.inspect = function (node) {
            return node.type.toLowerCase() || node.constructor.name.toLowerCase();
        };
        var cloneNode = exports.cloneNode = function (node) {
                if (node.clone)
                    return node.clone();
                if (Array.isArray(node))
                    return node.map(cloneNode);
                if (node.type) {
                    var res = {
                            type: node.type,
                            value: node.value
                        };
                    return;
                }
                if (typeof node !== 'object')
                    return node;
                else {
                    _.error(node);
                    throw Error('con"t clone node');
                }
            };
        exports.toBoolean = function (node) {
            if (!node)
                return false;
            var type = exports.inspect(node);
            switch (type) {
            case 'dimension':
                return node.value != 0;
            case 'string':
                return node.value.length !== '';
            case 'boolean':
                return node.value === true;
            case 'rgba':
            case 'ident':
            case 'componentvalues':
            case 'unknown':
                return true;
            default:
                return null;
            }
        };
        exports.isPrimary = function () {
        };
    },
    '4': function (require, module, exports, global) {
        var tk = require('1');
        var tree = require('3');
        var functions = require('5');
        var color = require('6');
        var _ = require('2');
        var io = require('7');
        var symtab = require('9');
        var state = require('8');
        var perror = new Error();
        var slice = [].slice;
        var errors = {
                INTERPOLATE_FAIL: 1,
                DECLARION_FAIL: 2
            };
        var combos = [
                'WS',
                '>',
                '~',
                '+'
            ];
        var skipStart = 'WS NEWLINE COMMENT ;';
        var operators = '+ - * /';
        var isSkipStart = _.makePredicate(skipStart);
        var isCombo = _.makePredicate(combos);
        var isSelectorSep = _.makePredicate(combos.concat([
                'PSEUDO_CLASS',
                'PSEUDO_ELEMENT',
                'ATTRIBUTE',
                'CLASS',
                'HASH',
                '&',
                'TEXT',
                '*',
                '#',
                ':',
                '.',
                'compoundident'
            ]));
        var isOperator = _.makePredicate(operators);
        var isColor = _.makePredicate('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgrey darkgreen darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray grey green greenyellow honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgrey lightgreen lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen');
        var isMcssAtKeyword = _.makePredicate('mixin extend var');
        var isMcssFutureAtKeyword = _.makePredicate('if else css for');
        var isCssAtKeyword = _.makePredicate('import page keyframe media font-face charset');
        var isShorthandProp = _.makePredicate('background font margin border border-top border-right border-bottom border-left border-width border-color border-style transition padding list-style border-radius.');
        var isWSOrNewLine = _.makePredicate('WS NEWLINE');
        var isCommaOrParen = _.makePredicate(', )');
        var isDirectOperate = _.makePredicate('RGBA DIMENSION STRING BOOLEAN TEXT NULL');
        var isRelationOp = _.makePredicate('== >= <= < > !=');
        var states = {
                'FILTER_DECLARATION': _.uid(),
                'TRY_DECLARATION': _.uid(),
                'TRY_INTERPOLATION': _.uid(),
                'FUNCTION_CALL': _.uid()
            };
        function Parser(options) {
            this.options = options || {};
        }
        exports.Parser = Parser;
        exports.parse = function (input, options, callback) {
            if (typeof input === 'string') {
                input = tk.tokenize(input, options || {});
            }
            return new Parser(options).parse(input, callback);
        };
        Parser.prototype = {
            parse: function (tks, callback) {
                this.lookahead = tks;
                this.p = 0;
                this.length = this.lookahead.length;
                this._states = {};
                this.scope = this.options.scope || new symtab.Scope();
                this.marked = null;
                this.tasks = 1;
                this.callback = callback;
                this.stylesheet();
                this._complete();
            },
            _complete: function () {
                this.tasks--;
                if (this.tasks == 0) {
                    this.callback(null, this.ast);
                }
            },
            state: function (state) {
                return this._states[state] === true;
            },
            enter: function (state) {
                this._states[state] = true;
            },
            leave: function (state) {
                this._states[state] = false;
            },
            next: function (k) {
                k = k || 1;
                this.p += k;
            },
            lookUpBefore: function (lookup, before) {
                var i = 1, la;
                while (i++) {
                    if ((la = this.la(i)) === lookup)
                        return true;
                    if (la === before || la === 'EOF' || la === '}') {
                        return false;
                    }
                }
                return false;
            },
            match: function (tokenType) {
                if (!this.eat.apply(this, arguments)) {
                    var ll = this.ll();
                    this.error('expect:"' + tokenType + '" -> got: "' + ll.type + '"');
                }
            },
            expect: function (tokenType, value) {
            },
            matcheNewLineOrSemeColon: function () {
                if (this.eat(';')) {
                    return true;
                } else if (this.eat('NEWLINE')) {
                    return true;
                } else {
                    this.error('expect: "NEWLINE" or ";"' + '->got: ' + this.ll().type);
                }
            },
            ll: function (k) {
                k = k || 1;
                if (this.p + k > this.length) {
                    return this.lookahead[this.length - 1];
                }
                return this.lookahead[this.p + k - 1];
            },
            la: function (k) {
                return this.ll(k).type;
            },
            is: function (pos, tokenType) {
                return this.la(pos) === tokenType;
            },
            mark: function () {
                this.marked = this.p;
                return this;
            },
            restore: function () {
                if (this.marked != undefined)
                    this.p = this.marked;
                this.marked = null;
                return this;
            },
            eat: function (tokenType) {
                var ll = this.ll();
                for (var i = 0, len = arguments.length; i < len; i++) {
                    if (ll.type === arguments[i]) {
                        this.next();
                        return ll;
                    }
                }
                return false;
            },
            skip: function (type) {
                var skiped, la, test;
                while (true) {
                    la = this.la();
                    test = typeof type === 'string' ? type === la : type(la);
                    if (test) {
                        this.next();
                        skiped = true;
                    } else
                        break;
                }
                return skiped;
            },
            skipStart: function () {
                return this.skip(isSkipStart);
            },
            skipWSorNewlne: function () {
                return this.skip(isWSOrNewLine);
            },
            error: function (msg) {
                if (typeof msg === 'number') {
                    perror.code = msg;
                    throw perror;
                }
                console.log(this.ast, this);
                throw Error(msg + ' on line:' + this.ll().lineno);
            },
            stylesheet: function () {
                var node = new tree.Stylesheet();
                this.ast = node;
                while (this.la(1) !== 'EOF') {
                    this.skipStart();
                    var stmt = this.stmt();
                    if (stmt) {
                        node.list.push(stmt);
                    }
                    this.skipStart();
                }
                return node;
            },
            stmt: function () {
                var la = this.la(), node = false;
                if (la === 'AT_KEYWORD') {
                    node = this.atrule();
                }
                if (la === 'VAR') {
                    switch (this.la(2)) {
                    case '(':
                        node = this.fnCall();
                        this.match(';');
                        break;
                    case ':':
                        node = this.transparentCall();
                        break;
                    case '=':
                    case '?=':
                        node = this.assign();
                        if (node.value.type !== 'func') {
                            this.match(';');
                        }
                        break;
                    default:
                        this.error('invalid squence after VARIABLE');
                    }
                }
                if (isSelectorSep(la)) {
                    node = this.ruleset(true);
                }
                if (node !== false) {
                    return node;
                }
                this.error('invalid statementstart');
            },
            atrule: function () {
                var lv = this.ll().value.toLowerCase();
                if (typeof this[lv] === 'function') {
                    return this[lv]();
                }
                return this.directive();
            },
            directive: function () {
                this.error('undefined atrule: "' + this.ll().value + '"');
            },
            param: function () {
                var name = this.ll().value, dft, rest = false;
                this.match('VAR');
                if (this.eat('...')) {
                    rest = true;
                }
                if (this.eat('=')) {
                    if (rest)
                        this.error('reset params can"t has default params');
                    dft = this.values();
                }
                return new tree.Param(name, dft, rest);
            },
            extend: function () {
                this.match('AT_KEYWORD');
                this.match('WS');
                var node = new tree.Extend(this.selectorList());
                this.match(';');
                return node;
                this.error('invalid extend at rule');
            },
            return: function () {
                this.match('AT_KEYWORD');
                this.match('WS');
                var node = new tree.ReturnStmt(this.valuesList());
                this.skip('WS');
                this.match(';');
            },
            import: function () {
                var node = new tree.Import(), ll;
                this.match('AT_KEYWORD');
                this.match('WS');
                if (this.la() === 'IDENT') {
                    node.assign = this.ll().value;
                    this.next();
                    this.match('WS');
                }
                ll = this.ll();
                if (ll.type === 'URL' || ll.type === 'STRING') {
                    node.url = ll.value;
                    this.next();
                } else {
                    this.error('expect URL or STRING' + ' got ' + ll.type);
                }
                this.eat('WS');
                this.matcheNewLineOrSemeColon();
                var uid = _.uid();
                this.tasks += 1;
                var self = this;
                io.get(node.url, function (error, text) {
                    exports.parse(text, {}, function (err, ast) {
                        var list = self.ast.list, len = list.length;
                        if (ast.list.length) {
                            for (var i = 0; i < len; i++) {
                                if (list[i] === uid) {
                                    var args;
                                    if (node.assign) {
                                        var tmp = [new tree.Module(node.assign, new tree.Block(ast.list))];
                                    } else {
                                        tmp = ast.list;
                                    }
                                    args = [
                                        i,
                                        1
                                    ].concat(tmp);
                                    list.splice.apply(list, args);
                                    break;
                                }
                            }
                        }
                        self._complete();
                    });
                });
                return uid;
            },
            module: function () {
                var node = new tree.Module();
                this.match('AT_KEYWORD');
                this.match('WS');
                node.name = this.ll().value;
                this.match('TEXT');
                node.block = this.block();
                return node;
            },
            pointer: function () {
                var name = this.ll().value;
                var node = new tree.Pointer(name);
                this.match('IDENT');
                this.match('->');
                node.key = this.ll().value;
                if (!this.eat('IDENT') && !this.eat('FUNCTION')) {
                    this.error('invalid pointer');
                }
                return node;
            },
            if: function () {
                this.match('AT_KEYWORD');
                var test = this.expression(), block = this.block(), alt, ll;
                this.eat('WS');
                ll = this.ll();
                if (ll.type == 'AT_KEYWORD') {
                    if (ll.value === 'else') {
                        this.next();
                        alt = this.block();
                    }
                    if (ll.value === 'elseif') {
                        alt = this.if();
                    }
                }
                return new tree.IfStmt(test, block, alt);
            },
            for: function () {
                var element, index, list, of, block;
                this.match('AT_KEYWORD');
                this.match('WS');
                element = this.ll().value;
                this.match('VAR');
                if (this.eat(',')) {
                    index = this.ll().value;
                    this.match('VAR');
                }
                this.match('WS');
                of = this.ll();
                if (of.value !== 'of') {
                    this.error('for statement need "of" but got:' + ll.value);
                }
                this.match('TEXT');
                list = this.valuesList();
                if (list.list.length <= 1) {
                    this.error('@for statement need at least one element in list');
                }
                block = this.block();
                return new tree.ForStmt(element, index, list, block);
            },
            media: function () {
            },
            media_query_list: function () {
            },
            media_query: function () {
            },
            'font-face': function () {
            },
            charset: function () {
            },
            keyframe: function () {
            },
            page: function () {
            },
            debug: function () {
                this.match('AT_KEYWORD');
                this.match('WS');
                var node = this.expression();
                console.log(node, '!debug');
                this.match(';');
            },
            ruleset: function () {
                var node = new tree.RuleSet(), rule;
                node.selector = this.selectorList();
                node.block = this.block();
                return node;
            },
            block: function () {
                var node = new tree.Block();
                this.match('{');
                this.skip('WS');
                while (this.la() !== '}') {
                    node.list.push(this.mark().declaration() || this.restore().stmt());
                    this.skip('WS');
                }
                this.match('}');
                return node;
            },
            selectorList: function () {
                var node = new tree.SelectorList();
                do {
                    node.list.push(this.complexSelector());
                } while (this.eat(','));
                return node;
            },
            complexSelector: function () {
                var node = new tree.ComplexSelector();
                var selectorString = '';
                var i = 0, ll, interpolation;
                while (true) {
                    ll = this.ll();
                    if (ll.type === '#{' && this.ll(2) !== '}') {
                        interpolation = this.interpolation();
                        if (interpolation) {
                            selectorString += '#{' + i++ + '}';
                            node.interpolations.push(interpolation);
                        } else {
                            break;
                        }
                    } else if (isSelectorSep(ll.type)) {
                        selectorString += ll.value || (ll.type === 'WS' ? ' ' : ll.type);
                        this.next();
                    } else {
                        break;
                    }
                }
                node.string = selectorString;
                return node;
            },
            declaration: function (checked) {
                var node = new tree.Declaration();
                var ll1 = this.ll(1), ll2 = this.ll(2);
                if (ll1.type === '*' && ll2.type == 'TEXT') {
                    this.next(1);
                    ll2.value = '*' + ll2.value;
                }
                node.property = this.compoundIdent();
                if (!node.property)
                    return;
                this.eat('WS');
                if (!this.eat(':'))
                    return;
                if (node.property.toString() === 'filter') {
                    this.enter(states.FILTER_DECLARATION);
                }
                this.enter(states.TRY_DECLARATION);
                try {
                    node.value = this.valuesList();
                    this.leave(states.TRY_DECLARATION);
                } catch (error) {
                    if (error.code === errors.DECLARION_FAIL)
                        return;
                    throw error;
                }
                if (this.eat('IMPORTANT')) {
                    node.important = true;
                }
                if (this.la() !== '}') {
                    this.match(';');
                }
                this.leave(states.FILTER_DECLARATION);
                return node;
            },
            valuesList: function () {
                var list = [], values;
                do {
                    values = this.values();
                    if (values)
                        list.push(values);
                    else
                        break;
                } while (this.eat(','));
                return new tree.ValuesList(list);
            },
            values: function () {
                var list = [], value;
                while (true) {
                    value = this.value();
                    if (!value)
                        break;
                    if (value.type === 'values') {
                        list = list.concat(value.list);
                    } else {
                        list.push(value);
                    }
                }
                if (list.length === 1)
                    return list[0];
                return new tree.Values(list);
            },
            value: function () {
                this.eat('WS');
                return this.expression();
            },
            assign: function () {
                var name = this.ll().value, value, op, block, params = [], rest = 0;
                this.match('VAR');
                op = this.la();
                this.match('=', '?=');
                if (this.la() === '(' || this.la() === '{') {
                    if (this.eat('(')) {
                        this.eat('WS');
                        if (this.la() !== ')') {
                            do {
                                param = this.param();
                                if (param.rest)
                                    rest++;
                                params.push(param);
                            } while (this.eat(','));
                            if (rest >= 2)
                                this.error('can"t have more than 2 rest param');
                            this.eat('WS');
                        }
                        this.match(')');
                    }
                    block = this.block();
                    value = new tree.Func(name, params, block);
                } else {
                    value = this.valuesList();
                }
                return new tree.Assign(name, value, op === '?=' ? false : true);
            },
            expression: function () {
                this.eat('WS');
                if (this.la(2) === '...')
                    return this.range();
                return this.logicOrExpr();
            },
            logicOrExpr: function () {
                var node = this.logicAndExpr(), ll, right;
                while ((la = this.la()) === '||') {
                    this.next();
                    right = this.logicAndExpr();
                    var bValue = tree.toBoolean(node);
                    if (bValue !== null) {
                        if (bValue === false) {
                            node = right;
                        }
                    } else {
                        node = new tree.Operator(la, node, right);
                    }
                    this.eat('WS');
                }
                return node;
            },
            logicAndExpr: function () {
                var node = this.relationExpr(), ll, right;
                while ((la = this.la()) === '&&') {
                    this.next();
                    right = this.relationExpr();
                    var bValue = tree.toBoolean(node);
                    if (bValue !== null) {
                        if (bValue === true) {
                            node = right;
                        } else {
                            node = {
                                type: 'BOOLEAN',
                                value: false
                            };
                        }
                    } else {
                        node = new tree.Operator(la, node, right);
                    }
                    this.eat('WS');
                }
                return node;
            },
            relationExpr: function () {
                var left = this.binop1(), la, right;
                while (isRelationOp(la = this.la())) {
                    this.next();
                    this.eat('WS');
                    right = this.binop1();
                    if (isDirectOperate(left.type) && isDirectOperate(right.type)) {
                        left = this._relate(left, right, la);
                    } else {
                        left = new tree.Operator(la, left, right);
                    }
                    this.eat('WS');
                }
                return left;
            },
            range: function () {
                var left = this.ll(), node = new tree.ValuesList(), right, lc, rc, reverse;
                this.match('DIMENSION');
                this.eat('...');
                right = this.ll();
                this.match(left.type);
                lc = left.value;
                rc = right.value;
                reverse = lc > rc;
                for (; lc != rc;) {
                    node.list.push({
                        type: left.type,
                        value: lc
                    });
                    if (reverse)
                        lc -= 1;
                    else
                        lc += 1;
                }
                node.list.push({
                    type: left.type,
                    value: lc
                });
                return node;
            },
            binop1: function () {
                var left = this.binop2(), right, la;
                this.eat('WS');
                while ((la = this.la()) === '+' || this.la() === '-') {
                    this.next();
                    this.eat('WS');
                    right = this.binop2();
                    if (right.type === 'DIMENSION' && left.type === 'DIMENSION') {
                        left = this._add(left, right, la);
                    } else {
                        left = {
                            type: la,
                            left: left,
                            right: right
                        };
                    }
                    this.eat('WS');
                }
                return left;
            },
            binop2: function () {
                var left = this.unary(), right, la;
                this.eat('WS');
                while ((la = this.la()) === '*' || la === '/') {
                    this.next();
                    this.eat('WS');
                    right = this.unary();
                    if (right.type === 'DIMENSION' && left.type === 'DIMENSION') {
                        left = this._mult(left, right, la);
                    } else {
                        left = {
                            type: la,
                            left: left,
                            right: right
                        };
                    }
                    this.eat('WS');
                }
                return left;
            },
            unary: function () {
                var la, operator, value;
                if ((la = this.la()) === '-' || la === '+') {
                    operator = la;
                    this.next();
                }
                value = this.primary();
                if (operator !== '-')
                    return value;
                if (value.type === 'DIMENSION') {
                    return {
                        type: 'DIMENSION',
                        value: -value.value,
                        unit: value.unit
                    };
                }
                return new tree.Unary(value, operator);
            },
            primary: function () {
                var ll = this.ll(), node;
                switch (ll.type) {
                case '(':
                    return this.parenExpr();
                case '=':
                    if (this.state(states.FILTER_DECLARATION) && this.state(states.FUNCTION_CALL)) {
                        return ll;
                    }
                case '#{':
                case 'TEXT':
                    return this.compoundIdent();
                case 'FUNCTION':
                    return this.fnCall();
                case 'HASH':
                    this.next();
                    value = ll.value;
                    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
                        node = new tree.RGBA(value);
                    } else {
                        node = new tree.Unknown(ll.value);
                    }
                    return node;
                case 'RAW_STRING':
                case 'DIMENSION':
                case 'VAR':
                case 'BOOLEAN':
                case 'NULL':
                case 'URL':
                    this.next();
                    return ll;
                case '>':
                case '+':
                case '.':
                case '#':
                case ':':
                case '*':
                case 'PSEUDO_CLASS':
                case 'ATTRIBUTE':
                    if (this.state(states.TRY_DECLARATION)) {
                        _.error(errors.DECLARION_FAIL);
                        break;
                    }
                default:
                    return null;
                }
            },
            parenExpr: function () {
                this.match('(');
                this.eat('WS');
                if (this.la() === 'VAR' && (this.la(2) === '=' || this.la(2) === '?=')) {
                    node = this.assign();
                } else {
                    node = this.expression();
                }
                this.eat('WS');
                this.match(')');
                return node;
            },
            compoundIdent: function () {
                var list = [], ll, sep, node;
                while (true) {
                    ll = this.ll();
                    if (ll.type === '#{') {
                        sep = this.interpolation();
                        list.push(sep);
                    } else if (ll.type === 'TEXT') {
                        this.next();
                        list.push(ll.value);
                    } else
                        break;
                }
                if (!sep) {
                    return {
                        type: 'TEXT',
                        value: list[0]
                    };
                } else {
                    return new tree.CompoundIdent(list);
                }
            },
            interpolation: function () {
                var node;
                this.match('#{');
                node = this.valuesList();
                this.match('}');
                return node;
            },
            fnCall: function () {
                var ll = this.ll();
                var node = new tree.Call();
                node.name = ll.value;
                this.match('FUNCTION', 'VAR');
                this.match('(');
                this.enter(states.FUNCTION_CALL);
                node.arguments = this.valuesList();
                this.leave(states.FUNCTION_CALL);
                this.match(')');
                return node;
            },
            transparentCall: function () {
                var ll = this.ll();
                var node = new tree.Call();
                node.name = ll.value;
                this.match('VAR');
                this.match(':');
                node.arguments = this.valuesList();
                this.match(';');
                return node;
            },
            _add: function (actor1, actor2, op) {
                var value, unit;
                if (actor1.unit) {
                    unit = actor1.unit;
                } else {
                    unit = actor2.unit;
                }
                if (op === '+') {
                    value = actor1.value + actor2.value;
                } else {
                    value = actor1.value - actor2.value;
                }
                return {
                    type: 'DIMENSION',
                    value: value,
                    unit: unit
                };
            },
            _mult: function (actor1, actor2, op) {
                var unit, value;
                if (actor1.unit) {
                    unit = actor1.unit;
                } else {
                    unit = actor2.unit;
                }
                if (op === '*') {
                    value = actor1.value * actor2.value;
                } else {
                    if (actor2.value === 0)
                        this.error('can"t divid by zero');
                    value = actor1.value / actor2.value;
                }
                return {
                    type: 'DIMENSION',
                    value: value,
                    unit: unit
                };
            },
            _relate: function (left, right, op) {
                var bool = { type: 'BOOLEAN' };
                if (left.type !== right.type || left.unit !== right.unit) {
                    bool.value = op === '!=';
                } else {
                    if (left.value > right.value) {
                        bool.value = op === '>' || op === '>=' || op === '!=';
                    }
                    if (left.value < right.value) {
                        bool.value = op === '<' || op === '<=' || op === '!=';
                    }
                    if (left.value == right.value) {
                        bool.value = op === '==' || op === '>=' || op === '<=';
                    }
                }
                return bool;
            },
            _lookahead: function () {
                return this.lookahead.map(function (item) {
                    return item.type;
                }).join(',');
            }
        };
    },
    '5': function (require, module, exports, global) {
        var fs = null;
        var path = null;
        var slice = [].slice;
        var tree = require('3');
        var Color = require('6');
        exports.add = function () {
            return options.args.reduce(function (a, b) {
                return a + b;
            });
        };
        exports.base64 = function () {
            var dirname = options.dirname;
            if (!fs) {
                return 'url(' + options.args[0] + ')';
            } else {
            }
        };
        exports.u = function (string) {
            if (string.type !== 'STRING') {
                throw Error('mcss function "u" only accept string');
            }
            return string.val;
        };
        exports.lighen = function () {
        };
        exports.darken = function () {
        };
        var mediatypes = {
                '.eot': 'application/vnd.ms-fontobject',
                '.gif': 'image/gif',
                '.ico': 'image/vnd.microsoft.icon',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.otf': 'application/x-font-opentype',
                '.png': 'image/png',
                '.svg': 'image/svg+xml',
                '.ttf': 'application/x-font-ttf',
                '.webp': 'image/webp',
                '.woff': 'application/x-font-woff'
            };
        function converToBase64(imagePath) {
            imagePath = imagePath.replace(/[?#].*/g, '');
            var extname = path.extname(imagePath), stat, img;
            try {
                stat = fs.statSync(imagePath);
                if (stat.size > 4096) {
                    return false;
                }
                img = fs.readFileSync(imagePath, 'base64');
                return 'data:' + mediatypes[extname] + ';base64,' + img;
            } catch (e) {
                return false;
            }
        }
    },
    '6': function (require, module, exports, global) {
        module.exports = {
            hsl2rgb: function () {
            }
        };
    },
    '7': function (require, module, exports, global) {
        var fs = null;
        var path = null;
        var state = require('8');
        exports.get = function (path, callback) {
            if (fs) {
                fs.readFile(path, 'utf8', callback);
            } else {
                http(path, callback);
            }
        };
        exports.join = function () {
            for (var i = 0; i < len; i++) {
                var sep = arguments[i];
            }
        };
        var http = function (url, callback) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.onreadystatechange = function (e) {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    callback(null, xhr.responseText);
                }
            };
            xhr.send();
        };
    },
    '8': function (require, module, exports, global) {
        var _ = {};
        _.debug = true;
        _.files = [];
    },
    '9': function (require, module, exports, global) {
        var Symtable = exports.SymbolTable = function () {
            };
        var Scope = exports.Scope = function (parentScope) {
                this.parentScope = parentScope;
                this.symtable = {};
                this.isStruct = false;
            };
        Scope.prototype = {
            getSpace: function () {
                return this.symtable;
            },
            resolve: function (name) {
                var scope = this;
                while (scope) {
                    var symbol = scope.symtable[name];
                    if (symbol)
                        return symbol;
                    else {
                        if (this.isStruct)
                            return;
                        scope = scope.parentScope;
                    }
                }
            },
            define: function (name, value) {
                this.symtable[name] = value;
                return this;
            },
            getOuterScope: function () {
                return this.parentScope;
            },
            toStruct: function () {
                var scope = new Scope();
                scope.isStruct = true;
                scope.symtable = this.symtable;
                return scope;
            }
        };
    },
    'a': function (require, module, exports, global) {
        var Translator = require('b');
        var interpreter = require('d');
        var hook = require('f');
        exports.translate = function (ast, options) {
            if (typeof ast == 'string') {
                ast = interpreter.interpret(ast);
            }
            if (options.hooks && options.hooks.length)
                ast = hook.hook(ast, options);
            return new Translator(options).translate(ast);
        };
    },
    'b': function (require, module, exports, global) {
        var Walker = require('c');
        var tree = require('3');
        function Translator(options) {
            this.options = options || {};
        }
        var _ = Translator.prototype = new Walker();
        var walk = _.walk;
        _.translate = function (ast, callback) {
            this.ast = ast;
            this.indent = 1;
            return this.walk(ast);
        };
        _.walk_stylesheet = function (ast) {
            var cssText = '';
            var bodyText = this.walk(ast.list);
            return bodyText.join('\n');
        };
        _.walk_ruleset = function (ast) {
            var cssTexts = [this.walk(ast.selector)];
            cssTexts.push(this.walk(ast.block));
            return cssTexts.join('');
        };
        _.walk_selectorlist = function (ast) {
            return this.walk(ast.list).join(',\n');
        };
        _.walk_complexselector = function (ast) {
            return ast.string;
        };
        _.walk_block = function (ast) {
            var res = ['{\n'], rulesets = [], self = this;
            ast.list.forEach(function (sast) {
                if (tree.inspect(sast) === 'ruleset')
                    rulesets.push(sast);
                else
                    res.push('\t' + self.walk(sast) + '\n');
            });
            res.push('}\n');
            rulesets.forEach(function (ruleset) {
                res.push(self.walk(ruleset));
            });
            var text = res.join('');
            return text;
        };
        _.walk_componentvalues = function (ast) {
            var text = this.walk(ast.list).join(' ');
            return text;
        };
        _.walk_declaration = function (ast) {
            var text = ast.property;
            var value = this.walk(ast.value);
            return text + ': ' + value + ';';
        };
        _.walk_ident = function (ast) {
            return ast.val;
        };
        _.walk_string = function (ast) {
            return '"' + ast.val + '"';
        };
        _['walk_,'] = function (ast) {
            return ',';
        };
        _['walk_='] = function (ast) {
            return '=';
        };
        _.walk_unknown = function (ast) {
            return ast.name;
        };
        _.walk_cssfunction = function (ast) {
            return ast.name + '(' + this.walk(ast.value) + ')';
        };
        _.walk_module = function () {
            return '';
        };
        _.walk_uri = function (ast) {
            return 'url(' + ast.val + ')';
        };
        _.walk_rgba = function (ast) {
            return ast.tocss();
        };
        _.walk_dimension = function (ast) {
            var val = ast.val;
            return val.number + (val.unit ? val.unit : '');
        };
        _.walk_variable = function () {
            return '';
        };
        module.exports = Translator;
    },
    'c': function (require, module, exports, global) {
        var _ = require('2');
        var Walker = function () {
        };
        Walker.prototype = {
            constructor: Walker,
            walk: function (node) {
                if (Array.isArray(node)) {
                    return this._walkArray(node);
                } else {
                    return this._walk(node);
                }
            },
            walk_defaut: function (node) {
                if (node.list || node.body) {
                    return this.walk(node.list || node.body);
                } else if (node.type && this.walk_token) {
                    return this.walk_token(node);
                } else {
                    _.warn('no "' + this._inspect(node) + '" walk defined');
                }
            },
            _walkArray: function (nodes) {
                var self = this;
                var res = [];
                nodes.forEach(function (node) {
                    if (node)
                        res.push(self._walk(node));
                });
                return res;
            },
            _walk: function (node) {
                var sign = this._inspect(node), name = 'walk_' + sign;
                if (this[name])
                    return this[name](node);
                else
                    return this.walk_defaut(node);
            },
            _inspect: function (node) {
                if (!node)
                    return null;
                return node.type ? node.type.toLowerCase() : node.constructor.name.toLowerCase();
            },
            error: function (e) {
                throw e;
            }
        };
        module.exports = Walker;
    },
    'd': function (require, module, exports, global) {
        var Interpreter = require('e');
        var Parser = require('4');
        var Hook = require('f');
        exports.interpret = function (ast, options) {
            if (typeof ast === 'string') {
                ast = Parser.parse(ast, options);
            }
            return new Interpreter(options).interpret(ast);
        };
        exports.Interpreter = Interpreter;
    },
    'e': function (require, module, exports, global) {
        var Walker = require('c');
        var tree = require('3');
        var symtab = require('9');
        function Interpreter(options) {
        }
        ;
        var _ = Interpreter.prototype = new Walker();
        _.interpret = function (ast) {
            this.ast = ast;
            this.scope = new symtab.Scope();
            this.istack = [];
            this.rulesets = [];
            this.indent = 0;
            var res = this.walk(ast);
            return res;
        };
        _.walk_stylesheet = function (ast) {
            ast.scope = this.scope;
            var plist = ast.list, item;
            ast.list = [];
            for (ast.index = 0; !!plist[ast.index]; ast.index++) {
                if (item = this.walk(plist[ast.index])) {
                    if (Array.isArray(item)) {
                        ast = ast.concat(item);
                    }
                    ast.list.push(item);
                }
            }
            return ast;
        };
        _.walk_ruleset = function (ast) {
            ast.selector = this.concatSelector(ast.selector);
            this.down(ast);
            this.index++;
            ast.block = this.walk(ast.block);
            this.up(ast);
            this.indent--;
            if (this.indent) {
            }
            return ast;
        };
        _.walk_mixin = function (ast) {
            this.define(ast.name, ast);
        };
        _.walk_variable = function (ast) {
            this.walk(ast.value);
            this.define(ast.name, ast);
        };
        _.walk_include = function (ast) {
            var mixin = this.walk(ast.name), res, iscope, params;
            if (!mixin)
                this.error('no ' + ast.name + ' defined');
            this.expect(mixin, 'mixin');
            iscope = new symtab.Scope();
            params = this.walk(ast.params);
            this.push(iscope);
            var list = [];
            for (var i = 0; i < params.length; i++) {
                var formalName = mixin.formalParams[i] && mixin.formalParams[i].name, def;
                if (!params[i]) {
                    continue;
                }
                if (i !== 0) {
                    list.push({ type: ',' });
                }
                list = list.concat(params[i].list);
                if (formalName) {
                    this.define(formalName, new tree.Variable(formalName, params[i]));
                }
            }
            this.define('arguments', new tree.Variable('arguments', new tree.ComponentValues(list)));
            var block = tree.cloneNode(mixin.block);
            ast = this.walk(block);
            this.pop();
            return ast;
        };
        _.walk_module = function (ast) {
            this.down();
            ast.scope = this.scope.toStruct();
            this.walk(ast.block);
            this.up();
            this.define(ast.name, ast);
        };
        _.walk_pointer = function (ast) {
            var module = this.resolve(ast.name);
            if (!module)
                this.error('undefined module: "' + ast.name + '"');
            this.expect(module, 'module');
            var scope = module.scope;
            var node = scope.resolve(ast.key);
            if (!node)
                this.error('not "' + ast.key + '" in module:"' + ast.name + '"');
            return node;
        };
        _.walk_componentvalues = function (ast) {
            var self = this;
            var list = [], tmp;
            ast.list.forEach(function (item) {
                if (tmp = self.walk(item)) {
                    var type = self._inspect(tmp);
                    if (type === 'variable') {
                        list = list.concat(tmp.value.list);
                    } else {
                        list.push(tmp);
                    }
                } else
                    list.push(item);
            });
            ast.list = list;
            return ast;
        };
        _.walk_ident = function (ast) {
            var symbol = this.resolve(ast.val);
            if (symbol) {
                return symbol;
            } else
                return ast;
        };
        _.walk_dimension = function () {
        };
        _.walk_extend = function (ast) {
        };
        _.walk_import = function (ast) {
        };
        _.walk_block = function (ast) {
            var list = ast.list;
            var res = [], r;
            for (var i = 0, len = list.length; i < list.length; i++) {
                if (list[i] && (r = this.walk(list[i]))) {
                    if (Array.isArray(r) || tree.inspect(r) === 'block') {
                        res = res.concat(r.list || r);
                    } else {
                        res.push(r);
                    }
                }
            }
            ast.list = res;
            return ast;
        };
        _.walk_declaration = function (ast) {
            this.walk(ast.value);
            return ast;
        };
        _.down = function (ruleset) {
            if (ruleset)
                this.rulesets.push(ruleset);
            this.scope = new symtab.Scope(this.scope);
        };
        _.up = function (ruleset) {
            if (ruleset)
                this.rulesets.pop();
            this.scope = this.scope.getOuterScope();
        };
        _.concatSelector = function (selectorList) {
            var ss = this.rulesets;
            if (!ss.length)
                return selectorList;
            var parentList = ss[ss.length - 1].selector, slist = selectorList.list, plist = parentList.list, slen = slist.length, plen = plist.length, sstring, pstring, rstring, s, p, res;
            var res = new tree.SelectorList();
            for (p = 0; p < plen; p++) {
                pstring = plist[p].string;
                for (s = 0; s < slen; s++) {
                    sstring = slist[s].string;
                    if (~sstring.indexOf('&')) {
                        rstring = sstring.replace(/&/g, pstring);
                    } else {
                        rstring = pstring + ' ' + sstring;
                    }
                    res.list.push(new tree.ComplexSelector(rstring));
                }
            }
            return res;
        };
        _.push = function (scope) {
            this.istack.push(scope);
        };
        _.pop = function () {
            this.istack.pop();
        };
        _.peek = function () {
            var len;
            if (len = this.istack.length)
                return this.istack[len - 1];
        };
        _.define = function (id, symbol) {
            var scope;
            if (scope = this.peek()) {
                scope.define(id, symbol);
            } else {
                this.scope.define(id, symbol);
            }
        };
        _.resolve = function (id) {
            var scope, symbol;
            if ((scope = this.peek()) && (symbol = scope.resolve(id))) {
                return symbol;
            }
            return this.scope.resolve(id);
        };
        _.expect = function (ast, type) {
            if (!(this._inspect(ast) === type)) {
                throw Error('interpreter error! expect node: "' + type + '" got: "' + this._inspect(ast) + '"');
            }
        };
        module.exports = Interpreter;
    },
    'f': function (require, module, exports, global) {
        var Hook = require('g');
        exports.hook = function (ast, options) {
            new Hook(options).walk(ast);
            return ast;
        };
    },
    'g': function (require, module, exports, global) {
        var Walker = require('c');
        var Event = require('h');
        var hooks = require('i');
        function Hook(options) {
            options = options || {};
            this.load(options.hooks);
            this.indent = 0;
        }
        var _ = Hook.prototype = new Walker();
        Event.mixTo(_);
        var on = _.on;
        var walk = _._walk;
        _.load = function (names) {
            if (!names)
                return;
            var name;
            if (!(names instanceof Array)) {
                names = [names];
            }
            for (var i = 0, len = names.length; i < len; i++) {
                name = names[i];
                if (typeof name === 'string') {
                    this.on(hooks[name]);
                } else {
                    this.on(name);
                }
            }
        };
        _.on = function (name) {
            if (typeof name === 'string' && !~name.indexOf(':')) {
                name = name + ':up';
            }
            on.apply(this, arguments);
        };
        _._walk = function (tree) {
            var name = this._inspect(tree);
            if (name)
                this.trigger(name + ':' + 'down', tree);
            var res = walk.apply(this, arguments);
            if (name)
                this.trigger(name + ':' + 'up', tree);
            return res;
        };
        _.walk_stylesheet = function (tree) {
            this.walk(tree.list);
        };
        _.walk_ruleset = function (tree) {
            this.indent++;
            this.walk(tree.block);
            this.indent--;
        };
        _.walk_selectorlist = function (tree) {
            this.walk(tree.list);
        };
        _.walk_complexselector = function (tree) {
        };
        _.walk_block = function (tree) {
            this.walk(tree.list);
        };
        _.walk_componentvalues = function (tree) {
            this.walk(tree.list);
        };
        _.walk_declaration = function (tree) {
            this.walk(tree.value);
        };
        _.walk_ident = function (tree) {
            return tree.val;
        };
        _.walk_string = function (tree) {
        };
        _['walk_,'] = function (tree) {
        };
        _['walk_='] = function (tree) {
        };
        _.walk_unknown = function (tree) {
            return tree.name;
        };
        _.walk_cssfunction = function (tree) {
        };
        _.walk_uri = function (tree) {
        };
        _.walk_rgba = function (tree) {
        };
        _.walk_dimension = function (tree) {
        };
        _.walk_variable = function () {
        };
        module.exports = Hook;
    },
    'h': function (require, module, exports, global) {
        var slice = [].slice, ex = function (o1, o2, override) {
                for (var i in o2)
                    if (o1[i] == null || override) {
                        o1[i] = o2[i];
                    }
            };
        var API = {
                on: function (event, fn) {
                    if (typeof event === 'object') {
                        for (var i in event) {
                            this.on(i, event[i]);
                        }
                    } else {
                        var handles = this._handles || (this._handles = {}), calls = handles[event] || (handles[event] = []);
                        calls.push(fn);
                    }
                    return this;
                },
                off: function (event, fn) {
                    if (event)
                        this._handles = [];
                    if (!this._handles)
                        return;
                    var handles = this._handles, calls;
                    if (calls = handles[event]) {
                        if (!fn) {
                            handles[event] = [];
                            return this;
                        }
                        for (var i = 0, len = calls.length; i < len; i++) {
                            if (fn === calls[i]) {
                                calls.splice(i, 1);
                                return this;
                            }
                        }
                    }
                    return this;
                },
                trigger: function (event) {
                    var args = slice.call(arguments, 1), handles = this._handles, calls;
                    if (!handles || !(calls = handles[event]))
                        return this;
                    for (var i = 0, len = calls.length; i < len; i++) {
                        calls[i].apply(this, args);
                    }
                    return this;
                }
            };
        function Event(handles) {
            if (arguments.length)
                this.on.apply(this, arguments);
        }
        ;
        ex(Event.prototype, API);
        Event.mixTo = function (obj) {
            obj = typeof obj == 'function' ? obj.prototype : obj;
            ex(obj, API);
        };
        module.exports = Event;
    },
    'i': function (require, module, exports, global) {
        module.exports = {
            prefixr: require('j'),
            csscomb: require('l')
        };
    },
    'j': function (require, module, exports, global) {
        var prefixs = require('k').prefixs;
        var _ = require('2');
        var tree = require('3');
        var isTestProperties = _.makePredicate('border-radius transition');
        module.exports = {
            'block': function (tree) {
                var list = tree.list, len = list.length;
                for (; len--;) {
                    var declaration = list[len];
                    if (isTestProperties(declaration.property)) {
                        list.splice(len, 0, declaration.clone('-webkit-' + declaration.property), declaration.clone('-moz-' + declaration.property), declaration.clone('-mz-' + declaration.property), declaration.clone('-o-' + declaration.property));
                    }
                }
            }
        };
    },
    'k': function (require, module, exports, global) {
        exports.orders = {
            'position': 1,
            'z-index': 1,
            'top': 1,
            'right': 1,
            'bottom': 1,
            'left': 1,
            'display': 2,
            'visibility': 2,
            'float': 2,
            'clear': 2,
            'overflow': 2,
            'overflow-x': 2,
            'overflow-y': 2,
            '-ms-overflow-x': 2,
            '-ms-overflow-y': 2,
            'clip': 2,
            'zoom': 2,
            'flex-direction': 2,
            'flex-order': 2,
            'flex-pack': 2,
            'flex-align': 2,
            '-webkit-box-sizing': 3,
            '-moz-box-sizing': 3,
            'box-sizing': 3,
            'width': 3,
            'min-width': 3,
            'max-width': 3,
            'height': 3,
            'min-height': 3,
            'max-height': 3,
            'margin': 3,
            'margin-top': 3,
            'margin-right': 3,
            'margin-bottom': 3,
            'margin-left': 3,
            'padding': 3,
            'padding-top': 3,
            'padding-right': 3,
            'padding-bottom': 3,
            'padding-left': 3,
            'table-layout': 4,
            'empty-cells': 4,
            'caption-side': 4,
            'border-spacing': 4,
            'border-collapse': 6,
            'list-style': 4,
            'list-style-position': 4,
            'list-style-type': 4,
            'list-style-image': 4,
            'content': 5,
            'quotes': 5,
            'counter-reset': 5,
            'counter-increment': 5,
            'resize': 5,
            'cursor': 5,
            'nav-index': 5,
            'nav-up': 5,
            'nav-right': 5,
            'nav-down': 5,
            'nav-left': 5,
            '-webkit-transition': 5,
            '-moz-transition': 5,
            '-ms-transition': 5,
            '-o-transition': 5,
            'transition': 5,
            '-webkit-transition-delay': 5,
            '-moz-transition-delay': 5,
            '-ms-transition-delay': 5,
            '-o-transition-delay': 5,
            'transition-delay': 5,
            '-webkit-transition-timing-function': 5,
            '-moz-transition-timing-function': 5,
            '-ms-transition-timing-function': 5,
            '-o-transition-timing-function': 5,
            'transition-timing-function': 5,
            '-webkit-transition-duration': 5,
            '-moz-transition-duration': 5,
            '-ms-transition-duration': 5,
            '-o-transition-duration': 5,
            'transition-duration': 5,
            '-webkit-transition-property': 5,
            '-moz-transition-property': 5,
            '-ms-transition-property': 5,
            '-o-transition-property': 5,
            'transition-property': 5,
            '-webkit-transform': 5,
            '-moz-transform': 5,
            '-ms-transform': 5,
            '-o-transform': 5,
            'transform': 5,
            '-webkit-transform-origin': 5,
            '-moz-transform-origin': 5,
            '-ms-transform-origin': 5,
            '-o-transform-origin': 5,
            'transform-origin': 5,
            '-webkit-animation': 5,
            '-moz-animation': 5,
            '-ms-animation': 5,
            '-o-animation': 5,
            'animation': 5,
            '-webkit-animation-name': 5,
            '-moz-animation-name': 5,
            '-ms-animation-name': 5,
            '-o-animation-name': 5,
            'animation-name': 5,
            '-webkit-animation-duration': 5,
            '-moz-animation-duration': 5,
            '-ms-animation-duration': 5,
            '-o-animation-duration': 5,
            'animation-duration': 5,
            '-webkit-animation-play-state': 5,
            '-moz-animation-play-state': 5,
            '-ms-animation-play-state': 5,
            '-o-animation-play-state': 5,
            'animation-play-state': 5,
            '-webkit-animation-timing-function': 5,
            '-moz-animation-timing-function': 5,
            '-ms-animation-timing-function': 5,
            '-o-animation-timing-function': 5,
            'animation-timing-function': 5,
            '-webkit-animation-delay': 5,
            '-moz-animation-delay': 5,
            '-ms-animation-delay': 5,
            '-o-animation-delay': 5,
            'animation-delay': 5,
            '-webkit-animation-iteration-count': 5,
            '-moz-animation-iteration-count': 5,
            '-ms-animation-iteration-count': 5,
            '-o-animation-iteration-count': 5,
            'animation-iteration-count': 5,
            '-webkit-animation-direction': 5,
            '-moz-animation-direction': 5,
            '-ms-animation-direction': 5,
            '-o-animation-direction': 5,
            'animation-direction': 5,
            'text-align': 5,
            '-webkit-text-align-last': 5,
            '-moz-text-align-last': 5,
            '-ms-text-align-last': 5,
            'text-align-last': 5,
            'vertical-align': 5,
            'white-space': 5,
            'text-decoration': 5,
            'text-emphasis': 5,
            'text-emphasis-color': 5,
            'text-emphasis-style': 5,
            'text-emphasis-position': 5,
            'text-indent': 5,
            '-ms-text-justify': 5,
            'text-justify': 5,
            'text-transform': 5,
            'letter-spacing': 5,
            'word-spacing': 5,
            '-ms-writing-mode': 5,
            'text-outline': 5,
            'text-wrap': 5,
            'text-overflow': 5,
            '-ms-text-overflow': 5,
            'text-overflow-ellipsis': 5,
            'text-overflow-mode': 5,
            '-ms-word-wrap': 5,
            'word-wrap': 5,
            'word-break': 5,
            '-ms-word-break': 5,
            '-moz-tab-size': 5,
            '-o-tab-size': 5,
            'tab-size': 5,
            '-webkit-hyphens': 5,
            '-moz-hyphens': 5,
            'hyphens': 5,
            'pointer-events': 5,
            'opacity': 6,
            'filter:progid:DXImageTransform.Microsoft.Alpha(Opacity': 6,
            '-ms-filter:\'progid:DXImageTransform.Microsoft.Alpha': 6,
            '-ms-interpolation-mode': 6,
            'color': 6,
            'border': 6,
            'border-width': 6,
            'border-style': 6,
            'border-color': 6,
            'border-top': 6,
            'border-top-width': 6,
            'border-top-style': 6,
            'border-top-color': 6,
            'border-right': 6,
            'border-right-width': 6,
            'border-right-style': 6,
            'border-right-color': 6,
            'border-bottom': 6,
            'border-bottom-width': 6,
            'border-bottom-style': 6,
            'border-bottom-color': 6,
            'border-left': 6,
            'border-left-width': 6,
            'border-left-style': 6,
            'border-left-color': 6,
            '-webkit-border-radius': 6,
            '-moz-border-radius': 6,
            'border-radius': 6,
            '-webkit-border-top-left-radius': 6,
            '-moz-border-radius-topleft': 6,
            'border-top-left-radius': 6,
            '-webkit-border-top-right-radius': 6,
            '-moz-border-radius-topright': 6,
            'border-top-right-radius': 6,
            '-webkit-border-bottom-right-radius': 6,
            '-moz-border-radius-bottomright': 6,
            'border-bottom-right-radius': 6,
            '-webkit-border-bottom-left-radius': 6,
            '-moz-border-radius-bottomleft': 6,
            'border-bottom-left-radius': 6,
            '-webkit-border-image': 6,
            '-moz-border-image': 6,
            '-o-border-image': 6,
            'border-image': 6,
            '-webkit-border-image-source': 6,
            '-moz-border-image-source': 6,
            '-o-border-image-source': 6,
            'border-image-source': 6,
            '-webkit-border-image-slice': 6,
            '-moz-border-image-slice': 6,
            '-o-border-image-slice': 6,
            'border-image-slice': 6,
            '-webkit-border-image-width': 6,
            '-moz-border-image-width': 6,
            '-o-border-image-width': 6,
            'border-image-width': 6,
            '-webkit-border-image-outset': 6,
            '-moz-border-image-outset': 6,
            '-o-border-image-outset': 6,
            'border-image-outset': 6,
            '-webkit-border-image-repeat': 6,
            '-moz-border-image-repeat': 6,
            '-o-border-image-repeat': 6,
            'border-image-repeat': 6,
            'outline': 6,
            'outline-width': 6,
            'outline-style': 6,
            'outline-color': 6,
            'outline-offset': 6,
            'background': 6,
            'filter:progid:DXImageTransform.Microsoft.AlphaImageLoader': 6,
            'background-color': 6,
            'background-image': 6,
            'background-repeat': 6,
            'background-attachment': 6,
            'background-position': 6,
            'background-position-x': 6,
            '-ms-background-position-x': 6,
            'background-position-y': 6,
            '-ms-background-position-y': 6,
            'background-clip': 6,
            'background-origin': 6,
            '-webkit-background-size': 6,
            '-moz-background-size': 6,
            '-o-background-size': 6,
            'background-size': 6,
            'box-decoration-break': 6,
            '-webkit-box-shadow': 6,
            '-moz-box-shadow': 6,
            'box-shadow': 6,
            'filter:progid:DXImageTransform.Microsoft.gradient': 6,
            '-ms-filter:\'progid:DXImageTransform.Microsoft.gradient': 6,
            'text-shadow': 6,
            'font': 7,
            'font-family': 7,
            'font-size': 7,
            'font-weight': 7,
            'font-style': 7,
            'font-variant': 7,
            'font-size-adjust': 7,
            'font-stretch': 7,
            'font-effect': 7,
            'font-emphasize': 7,
            'font-emphasize-position': 7,
            'font-emphasize-style': 7,
            'font-smooth': 7,
            'line-height': 7
        };
    },
    'l': function (require, module, exports, global) {
        var orders = require('k').orders;
        module.exports = {
            'block': function (tree) {
                tree.list.sort(function (d1, d2) {
                    return (orders[d1.property] || 100) - (orders[d2.property] || 100);
                });
            }
        };
    }
}));