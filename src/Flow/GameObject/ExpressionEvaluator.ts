/**
 * @brief Maps template names to arrays of parameter maps for cross object state resolution
 * @example
 * {
 *   'Mine':    [{ oreOutput: 50 }, { oreOutput: 30 }],
 *   'Factory': [{ productionRate: 10, output: 0 }]
 * }
 */
export type CrossObjectState = Record<string, Array<Record<string, number>>>;

export type OrganizationScopedCrossObjectState = CrossObjectState;

/** @brief Result of a single expression evaluation */
export interface ExpressionResult {
    /** Whether the expression was evaluated without error @example true */
    success: boolean;

    /** Error message if evaluation failed @example 'Unknown variable: missingKey' */
    error?: string;
}

/** @brief Identifies the target of an expression left hand side as either a local key or inline cross object reference */
export interface ExpressionTarget {
    /** Whether this expression targets a remote object */
    isInlineTarget: boolean;

    /** Whether this inline target is organization scoped via the own qualifier */
    isOrganizationScoped?: boolean;

    /** Local parameter key when isInlineTarget is false @example 'output' */
    localKey?: string;

    /** Target template name when isInlineTarget is true @example 'Mine' */
    templateName?: string;

    /** Target parameter key on the remote template when isInlineTarget is true @example 'oreOutput' */
    remoteKey?: string;
}

/** @brief Stateless evaluator that processes math expressions against a mutable parameter state map */
export class ExpressionEvaluator {
    /** Assignment pattern matching local targets */
    private static readonly _LOCAL_ASSIGNMENT_PATTERN = /^([a-zA-Z_]\w*)\s*([\+\-\*\/]?=)\s*(.+)$/;

    /** Assignment pattern matching inline cross object targets */
    private static readonly _INLINE_TARGET_PATTERN = /^@([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\s*([\+\-\*\/]?=)\s*(.+)$/;

    /** Assignment pattern matching organization scoped inline cross object targets */
    private static readonly _ORG_SCOPED_INLINE_TARGET_PATTERN = /^@own\.([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\s*([\+\-\*\/]?=)\s*(.+)$/;

    /**
     * @brief Parses target information from an expression without evaluating it
     * @param expression string Expression to parse the left hand side from @example '@Mine.oreOutput -= 5'
     * @returns ExpressionTarget Target descriptor
     * @example
     * ParseTarget('@Mine.oreOutput -= 5'); // { isInlineTarget: true, templateName: 'Mine', remoteKey: 'oreOutput' }
     * ParseTarget('output += rate');       // { isInlineTarget: false, localKey: 'output' }
     */
    public ParseTarget(expression: string): ExpressionTarget {
        const trimmed = expression.trim();

        const orgScopedMatch = ExpressionEvaluator._ORG_SCOPED_INLINE_TARGET_PATTERN.exec(trimmed);
        if (orgScopedMatch) {
            return {
                isInlineTarget: true,
                isOrganizationScoped: true,
                templateName: orgScopedMatch[1],
                remoteKey: orgScopedMatch[2],
            };
        }

        const inlineMatch = ExpressionEvaluator._INLINE_TARGET_PATTERN.exec(trimmed);
        if (inlineMatch) {
            return {
                isInlineTarget: true,
                isOrganizationScoped: false,
                templateName: inlineMatch[1],
                remoteKey: inlineMatch[2],
            };
        }

        const localMatch = ExpressionEvaluator._LOCAL_ASSIGNMENT_PATTERN.exec(trimmed);
        if (localMatch) {
            return {
                isInlineTarget: false,
                localKey: localMatch[1],
            };
        }

        return { isInlineTarget: false };
    }

    /**
     * @brief Evaluates a single expression against a mutable parameter map supporting local and inline cross object targets
     * @param state Record Mutable parameter map for right hand side variable resolution
     * @param expression string Expression to evaluate @example 'output += productionRate * 2'
     * @param crossObjectState CrossObjectState Optional cross object state for template param references
     * @param targetState Record Optional separate state for inline target mutation defaulting to state if omitted
     * @returns ExpressionResult Success or failure with optional error detail
     * @example
     * const state = { output: 0, rate: 5 };
     * evaluator.Evaluate(state, 'output += rate * 3'); // state.output === 15
     */
    public Evaluate(
        state: Record<string, number>,
        expression: string,
        crossObjectState?: CrossObjectState,
        targetState?: Record<string, number>,
        organizationScopedState?: OrganizationScopedCrossObjectState,
    ): ExpressionResult {
        try {
            const trimmed = expression.trim();

            const orgScopedMatch = ExpressionEvaluator._ORG_SCOPED_INLINE_TARGET_PATTERN.exec(trimmed);
            if (orgScopedMatch) {
                const remoteKey = orgScopedMatch[2];
                const operator = orgScopedMatch[3];
                const rightHandSide = orgScopedMatch[4];

                const mutationTarget = targetState ?? state;

                if (!(remoteKey in mutationTarget)) {
                    return { success: false, error: `Unknown target variable: "${remoteKey}" on org-scoped inline target.` };
                }

                const rightValue = this.__EvaluateRightHandSide(state, rightHandSide, crossObjectState, organizationScopedState);
                mutationTarget[remoteKey] = this.__ApplyOperator(mutationTarget[remoteKey], operator, rightValue);

                return { success: true };
            }

            const inlineMatch = ExpressionEvaluator._INLINE_TARGET_PATTERN.exec(trimmed);
            if (inlineMatch) {
                const remoteKey = inlineMatch[2];
                const operator = inlineMatch[3];
                const rightHandSide = inlineMatch[4];

                const mutationTarget = targetState ?? state;

                if (!(remoteKey in mutationTarget)) {
                    return { success: false, error: `Unknown target variable: "${remoteKey}" on inline target.` };
                }

                const rightValue = this.__EvaluateRightHandSide(state, rightHandSide, crossObjectState, organizationScopedState);
                mutationTarget[remoteKey] = this.__ApplyOperator(mutationTarget[remoteKey], operator, rightValue);

                return { success: true };
            }

            const localMatch = ExpressionEvaluator._LOCAL_ASSIGNMENT_PATTERN.exec(trimmed);
            if (!localMatch) {
                return { success: false, error: `Invalid expression syntax: "${expression}". Expected: target operator expression.` };
            }

            const targetKey = localMatch[1];
            const operator = localMatch[2];
            const rightHandSide = localMatch[3];

            if (!(targetKey in state)) {
                return { success: false, error: `Unknown target variable: "${targetKey}".` };
            }

            const rightValue = this.__EvaluateRightHandSide(state, rightHandSide, crossObjectState, organizationScopedState);
            state[targetKey] = this.__ApplyOperator(state[targetKey], operator, rightValue);

            return { success: true };
        } catch(evaluationError) {
            const message = evaluationError instanceof Error ? evaluationError.message : String(evaluationError);
            return { success: false, error: message };
        }
    }

    /**
     * @brief Evaluates a batch of expressions sequentially stopping on first error
     * @param state Record Mutable parameter map
     * @param expressions string array Ordered expressions
     * @param crossObjectState CrossObjectState Optional cross object state
     * @returns ExpressionResult array One result per expression which may be shorter than input if stopped early
     * @example
     * evaluator.EvaluateBatch(state, ['output += rate', 'materials -= rate * 2']);
     */
    public EvaluateBatch(
        state: Record<string, number>,
        expressions: string[],
        crossObjectState?: CrossObjectState,
        organizationScopedState?: OrganizationScopedCrossObjectState,
    ): ExpressionResult[] {
        const results: ExpressionResult[] = [];

        for (const expression of expressions) {
            const result = this.Evaluate(state, expression, crossObjectState, undefined, organizationScopedState);
            results.push(result);

            if (!result.success) {
                break;
            }
        }

        return results;
    }

    /**
     * @brief Validates expression syntax without executing and returns any errors found
     * @param expression string Expression to validate @example 'output += rate * 2'
     * @param knownKeys string array Known parameter keys for variable resolution
     * @returns string array Error messages where empty means valid
     * @example
     * evaluator.ValidateSyntax('output += rate * 2', ['output', 'rate']); // []
     * evaluator.ValidateSyntax('@Mine.oreOutput -= 5', ['output']); // [] (inline target validated separately)
     */
    public ValidateSyntax(expression: string, knownKeys: string[]): string[] {
        const errors: string[] = [];

        try {
            const trimmed = expression.trim();

            const orgScopedMatch = ExpressionEvaluator._ORG_SCOPED_INLINE_TARGET_PATTERN.exec(trimmed);
            if (orgScopedMatch) {
                const rightHandSide = orgScopedMatch[4];

                const tokens = this.__Tokenize(rightHandSide);
                const dummyState: Record<string, number> = {};
                for (const key of knownKeys) {
                    dummyState[key] = 0;
                }

                const parser = new TokenParser(tokens, dummyState);
                parser.ParseExpression();

                if (!parser.IsAtEnd()) {
                    errors.push(`Unexpected token after expression: "${parser.CurrentToken()}".`);
                }

                return errors;
            }

            const inlineMatch = ExpressionEvaluator._INLINE_TARGET_PATTERN.exec(trimmed);
            if (inlineMatch) {
                const rightHandSide = inlineMatch[4];

                // Inline target key validation defers to context aware validation since remote template keys are unknown here

                const tokens = this.__Tokenize(rightHandSide);
                const dummyState: Record<string, number> = {};
                for (const key of knownKeys) {
                    dummyState[key] = 0;
                }

                const parser = new TokenParser(tokens, dummyState);
                parser.ParseExpression();

                if (!parser.IsAtEnd()) {
                    errors.push(`Unexpected token after expression: "${parser.CurrentToken()}".`);
                }

                return errors;
            }

            // Local assignment pattern
            const localMatch = ExpressionEvaluator._LOCAL_ASSIGNMENT_PATTERN.exec(trimmed);

            if (!localMatch) {
                errors.push(`Invalid assignment syntax. Expected: variable operator expression (e.g., "x += 1" or "@Template.param += 1").`);
                return errors;
            }

            const targetKey = localMatch[1];
            const rightHandSide = localMatch[3];

            if (!knownKeys.includes(targetKey)) {
                errors.push(`Unknown target variable: "${targetKey}". Known: ${knownKeys.join(`, `)}.`);
            }

            const tokens = this.__Tokenize(rightHandSide);
            const dummyState: Record<string, number> = {};
            for (const key of knownKeys) {
                dummyState[key] = 0;
            }

            const parser = new TokenParser(tokens, dummyState);
            parser.ParseExpression();

            if (!parser.IsAtEnd()) {
                errors.push(`Unexpected token after expression: "${parser.CurrentToken()}".`);
            }
        } catch(syntaxError) {
            const message = syntaxError instanceof Error ? syntaxError.message : String(syntaxError);
            errors.push(message);
        }

        return errors;
    }

    /**
     * @brief Parses and evaluates the right hand side expression using a recursive descent parser
     * @param state Record Variable state for lookups
     * @param expression string Right hand side expression @example 'productionRate * 2 + 5'
     * @param crossObjectState CrossObjectState Optional cross object lookup
     * @returns number Computed numeric result
     */
    private __EvaluateRightHandSide(
        state: Record<string, number>,
        expression: string,
        crossObjectState?: CrossObjectState,
        organizationScopedState?: OrganizationScopedCrossObjectState,
    ): number {
        const tokens = this.__Tokenize(expression);
        const parser = new TokenParser(tokens, state, crossObjectState, organizationScopedState);
        const result = parser.ParseExpression();

        if (!parser.IsAtEnd()) {
            throw new Error(`Unexpected token after expression: "${parser.CurrentToken()}".`);
        }

        return result;
    }

    /**
     * @brief Applies an assignment operator to current and computed values
     * @param currentValue number Existing value of the target
     * @param operator string Assignment operator @example '+='
     * @param rightValue number Computed right hand side value
     * @returns number New value for the target
     */
    private __ApplyOperator(currentValue: number, operator: string, rightValue: number): number {
        switch (operator) {
            case `=`:
                return rightValue;
            case `+=`:
                return currentValue + rightValue;
            case `-=`:
                return currentValue - rightValue;
            case `*=`:
                return currentValue * rightValue;
            case `/=`:
                if (rightValue === 0) {
                    throw new Error(`Division by zero.`);
                }
                return currentValue / rightValue;
            default:
                throw new Error(`Unsupported operator: "${operator}".`);
        }
    }

    /**
     * @brief Tokenizes a math expression into an array of tokens
     * @param expression string Raw expression @example 'max(rate * 2, 10)'
     * @returns string array Token array @example ['max', '(', 'rate', '*', '2', ',', '10', ')']
     */
    private __Tokenize(expression: string): string[] {
        const tokens: string[] = [];
        const rawExpression = expression.trim();
        let position = 0;

        while (position < rawExpression.length) {
            const character = rawExpression[position];

            // Skip whitespace
            if (/\s/.test(character)) {
                position++;
                continue;
            }

            // Two character comparison operators
            if (position + 1 < rawExpression.length) {
                const twoChar = rawExpression.substring(position, position + 2);
                if (twoChar === `>=` || twoChar === `<=` || twoChar === `==`) {
                    tokens.push(twoChar);
                    position += 2;
                    continue;
                }
            }

            // Single character comparison operators
            if (character === `>` || character === `<`) {
                tokens.push(character);
                position++;
                continue;
            }

            // Arithmetic operators and grouping characters
            if (`+-*/(),@.`.includes(character)) {
                tokens.push(character);
                position++;
                continue;
            }

            // Numbers including integers and decimals
            if (/[0-9.]/.test(character)) {
                let numberToken = ``;
                while (position < rawExpression.length && /[0-9.]/.test(rawExpression[position])) {
                    numberToken += rawExpression[position];
                    position++;
                }
                tokens.push(numberToken);
                continue;
            }

            // Identifiers including variable references and function names
            if (/[a-zA-Z_]/.test(character)) {
                let identifierToken = ``;
                while (position < rawExpression.length && /[a-zA-Z0-9_]/.test(rawExpression[position])) {
                    identifierToken += rawExpression[position];
                    position++;
                }
                tokens.push(identifierToken);
                continue;
            }

            throw new Error(`Unexpected character "${character}" at position ${position}.`);
        }

        return tokens;
    }
}

/** @brief Set of built in function names recognized by the parser */
const BUILTIN_FUNCTIONS = new Set([`min`, `max`, `clamp`, `floor`, `ceil`, `abs`, `if`, `sum`, `avg`, `count`]);

/** @brief Recursive descent parser for tokenized math expressions */
class TokenParser {
    /** Current read position in the token array */
    private _position: number = 0;

    /**
     * @brief Creates a token parser
     * @param _tokens string array Tokenized expression
     * @param _state Record Variable state for identifier resolution
     * @param _crossObjectState CrossObjectState Optional cross object state for template references
     */
    constructor(
        private readonly _tokens: string[],
        private readonly _state: Record<string, number>,
        private readonly _crossObjectState?: CrossObjectState,
        private readonly _organizationScopedState?: OrganizationScopedCrossObjectState,
    ) {}

    /**
     * @brief Parses a full expression as the entry point handling comparison precedence
     * @returns number Evaluated result
     */
    public ParseExpression(): number {
        return this.__ParseComparison();
    }

    /**
     * @brief Checks if the parser has consumed all tokens
     * @returns boolean True if at end
     */
    public IsAtEnd(): boolean {
        return this._position >= this._tokens.length;
    }

    /**
     * @brief Gets the current token for error reporting
     * @returns string Current token value
     */
    public CurrentToken(): string {
        return this._tokens[this._position] ?? `<end>`;
    }

    /**
     * @brief Parses comparison expressions returning 1 for true and 0 for false
     * @returns number Evaluated result
     */
    private __ParseComparison(): number {
        let result = this.__ParseAdditive();

        while (
            this.__Peek() === `>` ||
            this.__Peek() === `<` ||
            this.__Peek() === `>=` ||
            this.__Peek() === `<=` ||
            this.__Peek() === `==`
        ) {
            const operator = this._tokens[this._position];
            this._position++;
            const right = this.__ParseAdditive();

            switch (operator) {
                case `>`:
                    result = result > right ? 1 : 0;
                    break;
                case `<`:
                    result = result < right ? 1 : 0;
                    break;
                case `>=`:
                    result = result >= right ? 1 : 0;
                    break;
                case `<=`:
                    result = result <= right ? 1 : 0;
                    break;
                case `==`:
                    result = result === right ? 1 : 0;
                    break;
            }
        }

        return result;
    }

    /**
     * @brief Parses additive expressions for addition and subtraction
     * @returns number Evaluated result
     */
    private __ParseAdditive(): number {
        let result = this.__ParseTerm();

        while (this.__Match(`+`) || this.__Match(`-`)) {
            const operator = this._tokens[this._position - 1];
            const right = this.__ParseTerm();
            result = operator === `+` ? result + right : result - right;
        }

        return result;
    }

    /**
     * @brief Parses a multiplicative term for multiplication and division
     * @returns number Evaluated result
     */
    private __ParseTerm(): number {
        let result = this.__ParseFactor();

        while (this.__Match(`*`) || this.__Match(`/`)) {
            const operator = this._tokens[this._position - 1];
            const right = this.__ParseFactor();

            if (operator === `/` && right === 0) {
                throw new Error(`Division by zero in expression.`);
            }

            result = operator === `*` ? result * right : result / right;
        }

        return result;
    }

    /**
     * @brief Parses a factor which is a number variable function call grouped expression unary minus or cross object reference
     * @returns number Evaluated result
     */
    private __ParseFactor(): number {
        // Unary minus
        if (this.__Match(`-`)) {
            return -this.__ParseFactor();
        }

        // Parenthesized subexpression
        if (this.__Match(`(`)) {
            const result = this.ParseExpression();

            if (!this.__Match(`)`)) {
                throw new Error(`Missing closing parenthesis.`);
            }

            return result;
        }

        // Cross object reference
        if (this.__Match(`@`)) {
            return this.__ParseCrossObjectReference();
        }

        const token = this._tokens[this._position];

        if (token === undefined) {
            throw new Error(`Unexpected end of expression.`);
        }

        // Numeric literal
        if (/^[0-9]/.test(token)) {
            this._position++;
            const numericValue = parseFloat(token);

            if (isNaN(numericValue)) {
                throw new Error(`Invalid number: "${token}".`);
            }

            return numericValue;
        }

        // Identifier which may be a function call or variable reference
        if (/^[a-zA-Z_]/.test(token)) {
            this._position++;

            // Check if this is a function call
            if (BUILTIN_FUNCTIONS.has(token) && this.__Peek() === `(`) {
                return this.__ParseFunctionCall(token);
            }

            // Variable reference
            if (!(token in this._state)) {
                throw new Error(`Unknown variable: "${token}".`);
            }

            return this._state[token];
        }

        throw new Error(`Unexpected token: "${token}".`);
    }

    /**
     * @brief Parses a cross object reference after the at token has been consumed returning the value when exactly one object matches or throwing on ambiguity
     * @returns number Resolved value
     */
    private __ParseCrossObjectReference(): number {
        const firstToken = this._tokens[this._position];

        if (!firstToken || !/^[a-zA-Z_]/.test(firstToken)) {
            throw new Error(`Expected template name after "@".`);
        }

        let isOrgScoped = false;
        let templateName: string;

        if (firstToken === `own`) {
            isOrgScoped = true;
            this._position++;

            if (!this.__Match(`.`)) {
                throw new Error(`Expected "." after "@own" in organization-scoped reference.`);
            }

            templateName = this._tokens[this._position];
            if (!templateName || !/^[a-zA-Z_]/.test(templateName)) {
                throw new Error(`Expected template name after "@own.".`);
            }
            this._position++;
        } else {
            templateName = firstToken;
            this._position++;
        }

        if (!this.__Match(`.`)) {
            throw new Error(`Expected "." after template name in cross-object reference "@${isOrgScoped ? 'own.' : ''}${templateName}".`);
        }

        const paramKey = this._tokens[this._position];

        if (!paramKey || !/^[a-zA-Z_]/.test(paramKey)) {
            throw new Error(`Expected parameter key after "@${isOrgScoped ? 'own.' : ''}${templateName}.".`);
        }

        this._position++;

        const resolveState = isOrgScoped ? this._organizationScopedState : this._crossObjectState;
        const scopeLabel = isOrgScoped ? `organization-scoped ` : ``;

        if (!resolveState) {
            throw new Error(`Cross-object reference "@${isOrgScoped ? 'own.' : ''}${templateName}.${paramKey}" used but no ${scopeLabel}cross-object state is available.`);
        }

        const objectsOfTemplate = resolveState[templateName];

        if (!objectsOfTemplate || objectsOfTemplate.length === 0) {
            throw new Error(`No objects found for template "${templateName}" in ${scopeLabel}cross-object state.`);
        }

        const matchingObjects = objectsOfTemplate.filter(objectState => {
            return paramKey in objectState;
        });

        if (matchingObjects.length === 0) {
            throw new Error(`Parameter "${paramKey}" not found on any "${templateName}" object.`);
        }

        if (matchingObjects.length > 1) {
            const prefix = isOrgScoped ? `@own.` : `@`;
            throw new Error(`Ambiguous scalar reference "${prefix}${templateName}.${paramKey}" matched ${matchingObjects.length} objects. Use sum(${prefix}${templateName}.${paramKey}) or avg(${prefix}${templateName}.${paramKey}) for aggregation.`);
        }

        return matchingObjects[0][paramKey];
    }

    /**
     * @brief Resolves a cross object reference and returns all values for aggregate functions
     * @param templateName string Template name from the at reference
     * @param paramKey string Parameter key on the referenced objects
     * @returns number array Values from all matching objects
     */
    private __ResolveCrossObjectValues(templateName: string, paramKey: string, isOrgScoped: boolean = false): number[] {
        const resolveState = isOrgScoped ? this._organizationScopedState : this._crossObjectState;
        const scopeLabel = isOrgScoped ? `organization-scoped ` : ``;

        if (!resolveState) {
            throw new Error(`Cross-object reference "@${isOrgScoped ? 'own.' : ''}${templateName}.${paramKey}" used but no ${scopeLabel}cross-object state is available.`);
        }

        const objectsOfTemplate = resolveState[templateName];

        if (!objectsOfTemplate || objectsOfTemplate.length === 0) {
            throw new Error(`No objects found for template "${templateName}" in ${scopeLabel}cross-object state.`);
        }

        const values: number[] = [];
        for (const objectState of objectsOfTemplate) {
            if (paramKey in objectState) {
                values.push(objectState[paramKey]);
            }
        }

        if (values.length === 0) {
            throw new Error(`Parameter "${paramKey}" not found on any "${templateName}" object.`);
        }

        return values;
    }

    /**
     * @brief Parses a function call after the function name has been consumed
     * @param functionName string Name of the function being called
     * @returns number Function evaluation result
     */
    private __ParseFunctionCall(functionName: string): number {
        if (!this.__Match(`(`)) {
            throw new Error(`Expected '(' after function name "${functionName}".`);
        }

        // Aggregate functions with cross object reference argument
        const aggregateFunctions = new Set([`sum`, `avg`, `count`]);
        if (aggregateFunctions.has(functionName) && this.__Peek() === `@`) {
            return this.__ParseAggregateFunction(functionName);
        }

        const argumentValues: number[] = [];

        // Parse comma separated arguments
        if (this.__Peek() !== `)`) {
            argumentValues.push(this.ParseExpression());

            while (this.__Match(`,`)) {
                argumentValues.push(this.ParseExpression());
            }
        }

        if (!this.__Match(`)`)) {
            throw new Error(`Expected ')' after arguments for "${functionName}".`);
        }

        return this.__EvaluateBuiltinFunction(functionName, argumentValues);
    }

    /**
     * @brief Parses an aggregate function call with a cross object reference argument
     * @param functionName string Aggregate function name
     * @returns number Aggregated result
     */
    private __ParseAggregateFunction(functionName: string): number {
        if (!this.__Match(`@`)) {
            throw new Error(`Expected '@' in aggregate function "${functionName}".`);
        }

        let isOrgScoped = false;
        const firstToken = this._tokens[this._position];

        if (firstToken === `own`) {
            isOrgScoped = true;
            this._position++;

            if (!this.__Match(`.`)) {
                throw new Error(`Expected "." after "own" in aggregate function "${functionName}(@own...)".`);
            }
        }

        const templateName = this._tokens[this._position];
        if (!templateName || !/^[a-zA-Z_]/.test(templateName)) {
            throw new Error(`Expected template name in aggregate function "${functionName}".`);
        }
        this._position++;

        if (!this.__Match(`.`)) {
            throw new Error(`Expected "." after template name in "${functionName}(@${isOrgScoped ? 'own.' : ''}${templateName}...)".`);
        }

        const paramKey = this._tokens[this._position];
        if (!paramKey || !/^[a-zA-Z_]/.test(paramKey)) {
            throw new Error(`Expected parameter key in "${functionName}(@${isOrgScoped ? 'own.' : ''}${templateName}.)".`);
        }
        this._position++;

        if (!this.__Match(`)`)) {
            throw new Error(`Expected ')' after aggregate reference in "${functionName}".`);
        }

        const values = this.__ResolveCrossObjectValues(templateName, paramKey, isOrgScoped);

        switch (functionName) {
            case `sum`:
                return values.reduce((accumulator, value) => {
                    return accumulator + value;
                }, 0);
            case `avg`:
                return values.reduce((accumulator, value) => {
                    return accumulator + value;
                }, 0) / values.length;
            case `count`:
                return values.length;
            default:
                throw new Error(`Unknown aggregate function: "${functionName}".`);
        }
    }

    /**
     * @brief Evaluates a built in function with the given arguments
     * @param functionName string Function name
     * @param argumentValues number array Evaluated argument values
     * @returns number Function result
     */
    private __EvaluateBuiltinFunction(functionName: string, argumentValues: number[]): number {
        switch (functionName) {
            case `min`:
                this.__AssertArgumentCount(functionName, argumentValues, 2);
                return Math.min(argumentValues[0], argumentValues[1]);

            case `max`:
                this.__AssertArgumentCount(functionName, argumentValues, 2);
                return Math.max(argumentValues[0], argumentValues[1]);

            case `clamp`:
                this.__AssertArgumentCount(functionName, argumentValues, 3);
                return Math.min(Math.max(argumentValues[0], argumentValues[1]), argumentValues[2]);

            case `floor`:
                this.__AssertArgumentCount(functionName, argumentValues, 1);
                return Math.floor(argumentValues[0]);

            case `ceil`:
                this.__AssertArgumentCount(functionName, argumentValues, 1);
                return Math.ceil(argumentValues[0]);

            case `abs`:
                this.__AssertArgumentCount(functionName, argumentValues, 1);
                return Math.abs(argumentValues[0]);

            case `if`:
                this.__AssertArgumentCount(functionName, argumentValues, 3);
                return argumentValues[0] > 0 ? argumentValues[1] : argumentValues[2];

            default:
                throw new Error(`Unknown function: "${functionName}".`);
        }
    }

    /**
     * @brief Asserts that a function received the expected number of arguments
     * @param functionName string Function name for error message
     * @param argumentValues number array Provided arguments
     * @param expected number Expected argument count
     */
    private __AssertArgumentCount(functionName: string, argumentValues: number[], expected: number): void {
        if (argumentValues.length !== expected) {
            throw new Error(`Function "${functionName}" expects ${expected} arguments, got ${argumentValues.length}.`);
        }
    }

    /**
     * @brief Peeks at the current token without consuming it
     * @returns string or undefined Current token or undefined if at end
     */
    private __Peek(): string | undefined {
        return this._tokens[this._position];
    }

    /**
     * @brief Matches and consumes a token if it equals the expected value
     * @param expected string Token to match
     * @returns boolean True if matched and consumed
     */
    private __Match(expected: string): boolean {
        if (this._position < this._tokens.length && this._tokens[this._position] === expected) {
            this._position++;
            return true;
        }
        return false;
    }
}

/** Singleton instance for convenience */
export const expressionEvaluator = new ExpressionEvaluator();
