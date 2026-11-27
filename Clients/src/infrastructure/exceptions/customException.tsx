/**
 * CustomException is a custom error class that extends the built-in Error class.
 * It is used to represent application-specific errors with a custom name.
 *
 * @extends {Error}
 *
 * @example
 * import CustomException from './CustomException';
 *
 * const ExampleComponent: React.FC = () => {
 *   const [inputValue, setInputValue] = useState<string>('');
 *
 *   const handleClick = () => {
 *     try {
 *       if (inputValue === '') {
 *         throw new CustomException('Input value cannot be empty');
 *       }
 *       alert('Input is valid');
 *     } catch (error) {
 *       if (error instanceof CustomException) {
 *         alert(error.message);
 *       } else {
 *         console.error('An unexpected error occurred:', error);
 *       }
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <input
 *         type="text"
 *         value={inputValue}
 *         onChange={(e) => setInputValue(e.target.value)}
 *       />
 *       <button onClick={handleClick}>Submit</button>
 *     </div>
 *   );
 * };
 */

class CustomException extends Error {
  status?: number | undefined;
  response?: any;

  constructor(message: string, status: number | undefined, response: any) {
    super(message);
    this.name = "CustomException";
    this.status = status;
    this.response = response;
  }
}

export default CustomException;
